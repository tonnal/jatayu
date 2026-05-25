"""
Demo dataset for the web product (no credits, no keys).

These are Coresignal-shaped mock profiles for Mandate A spanning the full fit
spectrum — bullseye boutique-AM compliance heads, family-office adjacents, weak
bank-AM-arm fits, and clear disqualifiers (bank / Big-4 / IFA / regulator). They
exist so the UI can exercise the REAL engine (query builder, firm classifier, fit
math, exporters) end-to-end. In live mode this is replaced by real Coresignal pulls.
"""

from __future__ import annotations


def _exp(title, company, industry, size, frm, to=None, months=None):
    return {
        "title": title, "company_name": company, "company_industry": industry,
        "company_size_employees_count": size, "date_from": frm, "date_to": to,
        "duration_months": months,
    }


# id, name, title, country, headline, [experiences], skills
MANDATE_A_PROFILES: list[dict] = [
    {
        "id": "A001", "full_name": "Wei Ling Tan", "job_title": "Head of Compliance",
        "location_country": "Singapore",
        "description": "Sole compliance officer at an independent SG asset manager; "
        "MAS CMS, AI onboarding, VCC, open-architecture distribution.",
        "skills": ["Regulatory Compliance", "Asset Management", "AML", "VCC"],
        "websites_professional_network": "https://linkedin.com/in/demo-weiling",
        "experience": [
            _exp("Head of Compliance", "Meridian Capital Management", "Investment Management", 28, "2018-01", None, 89),
            _exp("Compliance Manager", "Aurora Asset Management", "Investment Management", 40, "2013-01", "2017-12", 60),
        ],
        "certifications": [{"name": "ICA Diploma in Compliance"}],
        "education": [{"title": "LLB", "major": "Law"}],
    },
    {
        "id": "A002", "full_name": "Priya Menon", "job_title": "Chief Compliance Officer",
        "location_country": "Singapore",
        "description": "CCO at a boutique alternatives manager; MAS regulatory lead, "
        "fund governance, accredited-investor onboarding.",
        "skills": ["Compliance", "Fund Governance", "MAS", "Private Credit"],
        "websites_professional_network": "https://linkedin.com/in/demo-priya",
        "experience": [
            _exp("Chief Compliance Officer", "Lumen Alternatives", "Investment Management", 35, "2019-06", None, 71),
            _exp("Senior Compliance Officer", "Crestline Capital Partners", "Capital Markets", 60, "2014-01", "2019-05", 64),
        ],
        "education": [{"title": "LLB"}],
    },
    {
        "id": "A003", "full_name": "Daniel Koh", "job_title": "Head of Risk & Compliance",
        "location_country": "Singapore",
        "description": "Risk and compliance head at an independent SG fund manager; "
        "built the function from scratch post-licensing.",
        "skills": ["Compliance", "Risk Management", "Regulatory"],
        "websites_professional_network": "https://linkedin.com/in/demo-danielkoh",
        "experience": [
            _exp("Head of Risk & Compliance", "Sundara Investment Management", "Investment Management", 22, "2017-03", None, 99),
            _exp("Compliance Officer", "Pinnacle Asset Advisors", "Financial Services", 48, "2011-01", "2017-02", 73),
        ],
    },
    {
        "id": "A004", "full_name": "Grace Lim", "job_title": "Compliance Director",
        "location_country": "Singapore",
        "description": "Compliance director at a single family office investment arm; "
        "multi-asset, accredited investor focus.",
        "skills": ["Compliance", "Family Office", "AML"],
        "websites_professional_network": "https://linkedin.com/in/demo-gracelim",
        "experience": [
            _exp("Compliance Director", "Tanglin Family Office", "Financial Services", 18, "2020-01", None, 65),
            _exp("Compliance Manager", "Horizon Capital Management", "Investment Management", 55, "2015-01", "2019-12", 60),
        ],
    },
    {
        "id": "A005", "full_name": "Arjun Pillai", "job_title": "Senior Compliance Manager",
        "location_country": "Singapore",
        "description": "Compliance at a mid-size independent asset manager.",
        "skills": ["Regulatory Compliance", "Asset Management"],
        "websites_professional_network": "https://linkedin.com/in/demo-arjun",
        "experience": [
            _exp("Senior Compliance Manager", "Keppel Straits Capital", "Investment Management", 90, "2016-01", None, 113),
            _exp("Compliance Analyst", "Eastwood Funds", "Investment Management", 70, "2012-01", "2015-12", 48),
        ],
    },
    {
        "id": "A006", "full_name": "Michelle Goh", "job_title": "Manager, FS Advisory",
        "location_country": "Singapore",
        "description": "Financial services compliance advisory.",
        "skills": ["Advisory", "Compliance"],
        "websites_professional_network": "https://linkedin.com/in/demo-michelle",
        "experience": [
            _exp("Manager, FS Advisory", "Ernst & Young", "Accounting", 8000, "2016-01", None, 113),
        ],
    },
    {
        "id": "A007", "full_name": "Rajesh Kumar", "job_title": "VP, Compliance",
        "location_country": "Singapore",
        "description": "Compliance VP within a large banking group.",
        "skills": ["Compliance", "Banking"],
        "websites_professional_network": "https://linkedin.com/in/demo-rajesh",
        "experience": [
            _exp("VP, Compliance", "DBS Bank", "Banking", 33000, "2012-01", None, 160),
        ],
    },
    {
        "id": "A008", "full_name": "Serena Wong", "job_title": "Compliance Lead",
        "location_country": "Singapore",
        "description": "Compliance lead at a bank-owned asset management arm.",
        "skills": ["Compliance", "Asset Management"],
        "websites_professional_network": "https://linkedin.com/in/demo-serena",
        "experience": [
            _exp("Compliance Lead", "UBS Asset Management", "Investment Management", 800, "2015-01", None, 125),
            _exp("Compliance Officer", "Standard Chartered", "Banking", 80000, "2010-01", "2014-12", 60),
        ],
    },
    {
        "id": "A009", "full_name": "Faizal Rahman", "job_title": "Chief Compliance Officer",
        "location_country": "Singapore",
        "description": "CCO at a retail financial advisory distributor.",
        "skills": ["Compliance", "Retail"],
        "websites_professional_network": "https://linkedin.com/in/demo-faizal",
        "experience": [
            _exp("Chief Compliance Officer", "Prudential Financial Advisers", "Financial Services", 600, "2014-01", None, 137),
        ],
    },
    {
        "id": "A010", "full_name": "Cheryl Ng", "job_title": "Senior Manager, Supervision",
        "location_country": "Singapore",
        "description": "Ex-regulator, capital markets supervision.",
        "skills": ["Regulatory", "Supervision"],
        "websites_professional_network": "https://linkedin.com/in/demo-cheryl",
        "experience": [
            _exp("Senior Manager, Supervision", "Monetary Authority of Singapore", "Government", 2000, "2013-01", None, 149),
        ],
    },
    {
        "id": "A011", "full_name": "Marcus Lee", "job_title": "Head of Compliance",
        "location_country": "Singapore",
        "description": "Compliance head at a global asset manager's SG office.",
        "skills": ["Compliance", "Asset Management"],
        "websites_professional_network": "https://linkedin.com/in/demo-marcuslee",
        "experience": [
            _exp("Head of Compliance, APAC", "Schroders", "Investment Management", 5500, "2017-01", None, 101),
        ],
    },
    {
        "id": "A012", "full_name": "Nadia Salleh", "job_title": "Compliance Officer",
        "location_country": "Singapore",
        "description": "Compliance at a boutique private markets manager; lean team.",
        "skills": ["Compliance", "Private Equity", "MAS"],
        "websites_professional_network": "https://linkedin.com/in/demo-nadia",
        "experience": [
            _exp("Compliance Officer", "Straits Peak Capital", "Venture Capital & Private Equity", 16, "2019-01", None, 77),
            _exp("Associate, Compliance", "Banyan Tree Asset Management", "Investment Management", 45, "2014-06", "2018-12", 54),
        ],
    },
    {
        "id": "A013", "full_name": "Jonathan Tay", "job_title": "Compliance Manager",
        "location_country": "Singapore",
        "description": "Early-career compliance professional.",
        "skills": ["Compliance"],
        "websites_professional_network": "https://linkedin.com/in/demo-jonathan",
        "experience": [
            _exp("Compliance Manager", "Vertex Capital", "Investment Management", 30, "2021-01", None, 41),
            _exp("Compliance Analyst", "Vertex Capital", "Investment Management", 30, "2019-01", "2020-12", 24),
        ],
    },
    {
        "id": "A014", "full_name": "Aishah Karim", "job_title": "Head of Compliance",
        "location_country": "Singapore",
        "description": "Compliance head at an independent SG asset manager; "
        "open-architecture fund distribution, VCC launches, accredited investors.",
        "skills": ["Regulatory Compliance", "VCC", "Fund Distribution", "Front Office"],
        "websites_professional_network": "https://linkedin.com/in/demo-aishah",
        "experience": [
            _exp("Head of Compliance", "Clearwater Capital Singapore", "Investment Management", 38, "2016-09", None, 116),
            _exp("Compliance Manager", "Jade Harbour Asset Management", "Investment Management", 25, "2011-01", "2016-08", 67),
        ],
        "certifications": [{"name": "ICA Advanced Certificate"}],
    },
]


def profiles_for(mandate_id: str) -> list[dict]:
    # Mandate B demo reuses a small slice with investment-shaped firms; for now
    # the demo focuses on Mandate A (the executed mandate). B returns a stub.
    if mandate_id == "mandate_a":
        return MANDATE_A_PROFILES
    return MANDATE_A_PROFILES[:6]
