"""
Coresignal Clean Employee API client.

Thin, well-behaved wrapper over the two-step search→collect pattern plus bulk
collect. Every request is routed through a CreditLedger so spend is logged and
capped. Multisource enrichment is intentionally NOT implemented — it is out of
scope per the brief and costs 2x credits.

Docs: https://docs.coresignal.com  (Clean Employee API)
  Auth header:  apikey: {KEY}
  Base URL:     https://api.coresignal.com/cdapi
  Search:       POST /v2/employee_clean/search/es_dsl        -> [ids]
  Preview:      POST /v2/employee_clean/search/es_dsl/preview -> [partial profiles]
  Collect:      GET  /v2/employee_clean/collect/{id}         -> profile
  Bulk:         POST /v2/data_requests/employee_clean/es_dsl -> data_request_id
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .credits import CreditLedger

BASE_URL = "https://api.coresignal.com/cdapi"
SEARCH_PATH = "/v2/employee_clean/search/es_dsl"
PREVIEW_PATH = "/v2/employee_clean/search/es_dsl/preview"
COLLECT_PATH = "/v2/employee_clean/collect/{id}"


class CoresignalError(RuntimeError):
    pass


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 500, 502, 503, 504)
    return isinstance(exc, (httpx.TransportError, httpx.TimeoutException))


class CoresignalClient:
    def __init__(
        self,
        ledger: CreditLedger,
        *,
        api_key: str | None = None,
        stage: str = "dev",
        timeout: float = 60.0,
    ) -> None:
        self.api_key = api_key or os.environ.get("CORESIGNAL_API_KEY", "")
        if not self.api_key:
            raise CoresignalError(
                "No Coresignal API key. Set CORESIGNAL_API_KEY in .env."
            )
        self.ledger = ledger
        self.stage = stage  # "dev" | "production" — tags every ledger entry
        self._client = httpx.Client(
            base_url=BASE_URL,
            timeout=timeout,
            headers={
                "accept": "application/json",
                "apikey": self.api_key,
                "Content-Type": "application/json",
            },
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "CoresignalClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # -- low-level with retry ---------------------------------------------- #

    @retry(
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TransportError, httpx.TimeoutException)),
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=2, max=20),
        reraise=True,
    )
    def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        resp = self._client.request(method, path, **kwargs)
        if resp.status_code >= 400:
            # only retry the retryable ones; others raise immediately
            err = httpx.HTTPStatusError(
                f"{resp.status_code} from {path}: {resp.text[:300]}",
                request=resp.request,
                response=resp,
            )
            if _is_retryable(err):
                raise err
            raise CoresignalError(str(err))
        return resp

    # -- search ------------------------------------------------------------- #

    def search(self, es_dsl: dict, *, purpose: str, notes: str = "") -> list[str]:
        """Run a filtered search. Costs 1 credit regardless of result count.

        Returns a list of employee IDs (strings).
        """
        self.ledger.check_can_spend(1)
        resp = self._request("POST", SEARCH_PATH, json=es_dsl)
        ids = [str(x) for x in resp.json()]
        self.ledger.record(
            endpoint=SEARCH_PATH,
            query_or_id=_short_query(es_dsl),
            credit_cost=1,
            profiles_returned=len(ids),
            stage=self.stage,
            stage_purpose=purpose,
            notes=notes,
        )
        return ids

    def preview(self, es_dsl: dict, *, purpose: str, notes: str = "") -> list[dict]:
        """Search preview — partial profiles for cheap filter inspection. 1 credit."""
        self.ledger.check_can_spend(1)
        resp = self._request("POST", PREVIEW_PATH, json=es_dsl)
        rows = resp.json()
        self.ledger.record(
            endpoint=PREVIEW_PATH,
            query_or_id=_short_query(es_dsl),
            credit_cost=1,
            profiles_returned=len(rows),
            stage=self.stage,
            stage_purpose=purpose,
            notes=notes,
        )
        return rows

    # -- collect ------------------------------------------------------------ #

    def collect(self, employee_id: str, *, purpose: str, notes: str = "") -> dict:
        """Collect one full profile. Costs 1 credit per profile."""
        self.ledger.check_can_spend(1)
        resp = self._request("GET", COLLECT_PATH.format(id=employee_id))
        profile = resp.json()
        self.ledger.record(
            endpoint=COLLECT_PATH.format(id=employee_id),
            query_or_id=str(employee_id),
            credit_cost=1,
            profiles_returned=1,
            stage=self.stage,
            stage_purpose=purpose,
            notes=notes,
        )
        return profile

    def collect_many(
        self, ids: list[str], *, purpose: str, notes: str = ""
    ) -> list[dict]:
        """Collect a batch, stopping cleanly if the cap would be hit."""
        out: list[dict] = []
        for emp_id in ids:
            try:
                self.ledger.check_can_spend(1)
            except Exception:
                break  # cap reached — return what we have, caller decides
            out.append(self.collect(emp_id, purpose=purpose, notes=notes))
        return out


def _short_query(es_dsl: dict) -> str:
    """A compact, log-friendly representation of the query for the credit log."""
    import json

    s = json.dumps(es_dsl, separators=(",", ":"))
    return s if len(s) <= 500 else s[:497] + "..."
