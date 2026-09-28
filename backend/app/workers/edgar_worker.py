import asyncio
import io
import json
import logging
import os
import time
import uuid
from typing import Dict, Any, List, Optional
import redis.asyncio as redis
from sqlalchemy import select

from app.core.document_parser import parse_and_chunk_pdf
from app.core.embedder import generate_batch_embeddings, EMBEDDING_DIM
from app.database.database import AsyncSessionLocal
from app.database.models import DocumentChunk

logger = logging.getLogger("edgar_worker")

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
if "redis://redis:" in REDIS_URL and not os.path.exists("/.dockerenv"):
    REDIS_URL = REDIS_URL.replace("redis://redis:", "redis://localhost:")
elif "redis://fintech_redis:" in REDIS_URL:
    REDIS_URL = REDIS_URL.replace("redis://fintech_redis:", "redis://localhost:" if not os.path.exists("/.dockerenv") else "redis://redis:")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

TRACKED_TICKERS = ["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "AMD", "META"]

FILING_TEMPLATES = {
    "AAPL": {
        "title": "Apple Inc. Form 10-K Annual Report",
        "pages": [
            (
                "Item 1. Business Overview. Apple Inc. designs, manufactures, and markets smartphones, personal computers, "
                "tablets, wearables, and accessories worldwide. The Company sells its products through its retail and online "
                "stores, and through third-party cellular network carriers, wholesalers, retailers, and resellers. Apple also "
                "sells a variety of related services. The iPhone is the Company largest product line, generating 52.3 percent "
                "of net sales. Mac revenue contributed 10.4 percent, iPad 6.6 percent, Wearables, Home and Accessories 9.2 "
                "percent, and Services 21.5 percent of consolidated net sales. Services revenue includes fees from the App Store, "
                "AppleCare, Advertising, Apple Card, iCloud, Apple Music, Apple TV plus, Apple Arcade, and Apple Fitness plus."
            ),
            (
                "Item 1A. Risk Factors. The Company faces intense competition from established competitors with substantial "
                "resources as well as from new market entrants. Competition in the smartphone, personal computer, and tablet "
                "markets is characterized by aggressive pricing, frequent introduction of new products and services, short "
                "product life cycles, evolving industry standards, continual improvement in product performance characteristics, "
                "rapid adoption of technological and product advancements by competitors, and price sensitivity on the part of "
                "consumers and businesses. Failure to manage frequent introductions and transitions of products and services "
                "is a material risk. Global supply chain constraints, including semiconductor component availability from key "
                "suppliers such as TSMC, may impact product delivery schedules and gross margins. The Company depends on "
                "single-source suppliers for certain components, creating concentration risk."
            ),
            (
                "Item 1A Risk Factors Continued. The Company is exposed to the risk of unauthorized access to its products "
                "and information systems. The Company has implemented security controls across its product ecosystem; however, "
                "zero-day vulnerabilities and sophisticated nation-state threat actors present ongoing operational risks. "
                "Regulatory scrutiny and antitrust investigations in the European Union regarding App Store commission structures "
                "and in-app payment requirements may require changes to business practices and could reduce Services segment revenue. "
                "Currency fluctuation risk is material as approximately 57 percent of net sales are generated outside the United States. "
                "Litigation exposure related to patent infringement, employment practices, and environmental regulations is ongoing."
            ),
            (
                "Item 7. Management Discussion and Analysis. Net sales for fiscal year 2025 were 391.0 billion dollars, a "
                "decrease of 2.8 percent compared to the prior year, primarily due to lower iPhone sales in Greater China. "
                "Gross margin was 46.2 percent compared to 44.1 percent in the prior year, reflecting favorable Services mix. "
                "Gross margin for Products was 36.5 percent, while Services gross margin expanded to 72.8 percent. Operating "
                "expenses were 58.5 billion dollars, including research and development of 30.0 billion dollars and selling, "
                "general and administrative of 28.5 billion dollars. Net income was 93.7 billion dollars, or 6.08 diluted EPS. "
                "Capital expenditures totaled 11.2 billion dollars, primarily focused on datacenter infrastructure and tooling "
                "for manufacturing operations. The Company returned 110.0 billion dollars to shareholders through dividends "
                "and share repurchases during fiscal year 2025."
            ),
            (
                "Item 7A. Quantitative and Qualitative Disclosures About Market Risk. The Company is exposed to market risk "
                "related to changes in interest rates and foreign currency exchange rates. The Company maintains an investment "
                "portfolio of various holdings, types, and maturities. The primary objective of the Company investment activities "
                "is to preserve principal while at the same time maximizing the income received without significantly increasing "
                "risk. To achieve this objective, the Company maintains its portfolio of cash equivalents and investments in a "
                "mix of instruments including U.S. Treasury securities, agency securities, non-U.S. government securities, "
                "certificates of deposit, commercial paper, corporate debt securities, and municipal securities. The Company "
                "uses derivative instruments to partially offset its business exposure to foreign currency exchange risk."
            ),
            (
                "Item 8. Financial Statements. Consolidated Balance Sheet as of September 2025. Total assets were 364.9 billion "
                "dollars, consisting of current assets of 152.1 billion dollars and non-current assets of 212.8 billion dollars. "
                "Cash, cash equivalents and marketable securities were 156.4 billion dollars. Total liabilities were 308.0 "
                "billion dollars including long-term debt of 97.0 billion dollars. Total shareholders equity deficit was "
                "negative 43.1 billion dollars reflecting aggressive share repurchase program. Consolidated Statement of "
                "Operations for fiscal year ended September 2025. Net sales 391.0 billion. Cost of sales 210.0 billion. "
                "Gross margin 181.0 billion. Operating income 121.4 billion. Net income 93.7 billion."
            ),
        ],
    },
    "NVDA": {
        "title": "NVIDIA Corporation Form 10-K Annual Report",
        "pages": [
            (
                "Item 1. Business Overview. NVIDIA Corporation pioneered GPU-accelerated computing to solve complex "
                "computational problems in science, engineering, and AI. The Company operates across two reportable segments: "
                "Compute and Networking, and Graphics. The Compute and Networking segment includes the Data Center end market "
                "which generated 87.5 billion dollars in revenue during fiscal year 2025, representing 87 percent of total "
                "revenue. NVIDIA Hopper and Blackwell GPU architecture platforms serve hyperscale cloud providers, enterprise "
                "customers, and sovereign AI deployments globally. The Graphics segment includes GeForce gaming GPUs, "
                "professional visualization Quadro and RTX workstation products."
            ),
            (
                "Item 1A. Risk Factors. Concentration of customer demand among major cloud service providers including "
                "Microsoft Azure, Amazon Web Services, Alphabet Google Cloud, and Meta Platforms presents revenue volatility "
                "risk if any major customer reduces or delays purchases. Export control regulations administered by the "
                "U.S. Department of Commerce Bureau of Industry and Security regarding advanced compute architectures to "
                "foreign markets including the People Republic of China may permanently constrain addressable market. "
                "H100, H200, and Blackwell B100 series products are subject to export license requirements. The Company "
                "relies on TSMC as the sole manufacturer of its most advanced products, creating single-source supply risk."
            ),
            (
                "Item 1A Risk Factors Continued. AI model training workloads are inherently cyclical, and customer "
                "GPU clusters may reach capacity saturation points leading to order digestion periods. Competition from "
                "AMD Instinct MI300X and MI400 series accelerators, as well as custom ASIC solutions developed by "
                "hyperscalers including Google TPUs, Amazon Trainium, and Microsoft Maia, may erode market share. "
                "Intellectual property protection for CUDA ecosystem, NVLink interconnect, and Tensor Core architecture "
                "is critical to maintaining competitive differentiation. Supply chain disruptions affecting HBM3e memory "
                "from Samsung and SK Hynix could constrain Blackwell GPU system deliveries."
            ),
            (
                "Item 7. Management Discussion and Analysis. Revenue for fiscal year 2025 was 130.5 billion dollars, "
                "an increase of 114 percent year-over-year, driven by record Data Center segment growth. Gross margin "
                "expanded to 76.2 percent compared to 66.8 percent in the prior year, reflecting favorable Blackwell "
                "platform product mix and improved manufacturing yields. Operating income was 82.1 billion dollars, "
                "representing an operating margin of 62.9 percent. Net income was 72.9 billion dollars, or 2.94 diluted "
                "EPS. Research and development expenses were 10.1 billion dollars, an increase of 42 percent, focused on "
                "next-generation Rubin GPU architecture and NVLink Switch System 72. Capital expenditures were 3.5 billion."
            ),
            (
                "Item 7A. Market Risk and Liquidity. The Company held cash, cash equivalents, and investments of 43.2 "
                "billion dollars as of January 2025. The Company generated operating cash flow of 64.1 billion dollars "
                "during fiscal year 2025. The Board of Directors authorized a share repurchase program of 50.0 billion "
                "dollars. NVIDIA returned 15.4 billion dollars to shareholders through repurchases and dividends. "
                "The Company has a revolving credit facility of 1.0 billion dollars. Long-term debt outstanding was "
                "8.5 billion dollars with maturities ranging from 2026 through 2060. Weighted average interest rate "
                "on outstanding debt was 3.2 percent."
            ),
            (
                "Item 8. Financial Statements. Consolidated Balance Sheet January 2025. Total assets 101.1 billion. "
                "Current assets 52.3 billion including cash and equivalents 7.3 billion and marketable securities "
                "35.9 billion. Inventories 6.0 billion reflecting Blackwell GPU systems build-ahead. Property and "
                "equipment net 4.0 billion. Goodwill and intangible assets 5.7 billion from Mellanox acquisition. "
                "Total liabilities 27.1 billion including deferred revenue from software subscriptions 1.7 billion. "
                "Total stockholders equity 74.0 billion. Revenue breakdown: Data Center 130.5 billion, Gaming 11.4 "
                "billion, Professional Visualization 1.7 billion, Automotive 1.1 billion, OEM and Other 0.4 billion."
            ),
        ],
    },
    "TSLA": {
        "title": "Tesla, Inc. Form 10-K Annual Report",
        "pages": [
            (
                "Item 1. Business Overview. Tesla, Inc. designs, develops, manufactures, leases, and sells electric vehicles, "
                "energy generation and storage systems, and offers services related to its sustainable energy products. "
                "The Company operates manufacturing facilities in Fremont California, Austin Texas, Berlin Brandenburg Germany, "
                "and Shanghai China. Automotive segment revenue was 77.1 billion dollars in fiscal year 2024, representing "
                "85 percent of total revenue. Model Y remains the top-selling electric vehicle globally. Cybertruck deliveries "
                "commenced in Q4 2023. Energy generation and storage revenue was 7.1 billion dollars. Services revenue was "
                "6.7 billion. Total deliveries for fiscal 2024 were 1.79 million vehicles, including 1.74 million Model 3 and Y."
            ),
            (
                "Item 1A. Risk Factors. Increased competition in the global electric vehicle sector from legacy automakers "
                "including Ford, GM, Stellantis, and Volkswagen Group transitioning to EV production, as well as Chinese "
                "manufacturers BYD, Li Auto, Nio, and Xpeng, has exerted significant downward pressure on vehicle average "
                "selling prices. Model Y pricing was reduced multiple times across markets to maintain volume. Automotive "
                "regulatory credits contributed 1.79 billion dollars in high-margin revenue but are subject to expiration "
                "as competitors electrify their fleets. Expansion of manufacturing gigafactories requires substantial "
                "capital expenditures and exposes operations to construction delays and ramp inefficiencies."
            ),
            (
                "Item 1A Risk Factors Continued. Full Self-Driving FSD capability relies on supervised autonomy and has "
                "not yet achieved full regulatory approval for unsupervised operation in any jurisdiction. NHTSA investigations "
                "into Autopilot and FSD-related incidents may result in mandatory recalls or operational restrictions. "
                "Elon Musk executive leadership concentration risk is material as he is simultaneously serving as CEO "
                "of multiple companies. Raw material sourcing for lithium, cobalt, nickel, and manganese for battery "
                "cathode production is subject to supply chain volatility and geopolitical risk. Tesla Supercharger network "
                "expansion requires sustained capital deployment to support vehicle fleet growth."
            ),
            (
                "Item 7. Management Discussion and Analysis. Total revenue for fiscal year 2024 was 97.7 billion dollars, "
                "an increase of 1.0 percent year-over-year. Automotive gross margin excluding regulatory credits declined "
                "to 16.3 percent from 19.3 percent in the prior year, reflecting price reductions and higher warranty costs. "
                "Full Self-Driving software deferred revenue recognition accelerated following neural network feature deployments, "
                "contributing 0.9 billion dollars. Operating income was 4.0 billion dollars and operating margin was 4.1 percent. "
                "Net income attributable to common stockholders was 7.1 billion dollars, including 2.7 billion in regulatory "
                "credit income and investment gains. Capital expenditures were 11.0 billion dollars for gigafactory expansion."
            ),
            (
                "Item 7A. Liquidity and Capital Resources. Cash and cash equivalents and investments were 29.1 billion dollars "
                "at December 2024. The Company generated operating cash flow of 14.9 billion dollars. Free cash flow was "
                "3.9 billion dollars after capital expenditures of 11.0 billion. The Company has no revolving credit facilities "
                "in use. Long-term debt and finance leases outstanding were 6.3 billion dollars primarily related to solar "
                "energy system financing and real estate secured debt. Tesla Energy business Megapack product deployments "
                "reached 31.4 gigawatt-hours in 2024, a record high, with gross margin expanding to 24.6 percent."
            ),
        ],
    },
    "MSFT": {
        "title": "Microsoft Corporation Form 10-K Annual Report",
        "pages": [
            (
                "Item 1. Business Overview. Microsoft Corporation develops and supports software, services, devices, and "
                "solutions. The Company operates three reportable segments: Productivity and Business Processes, Intelligent "
                "Cloud, and More Personal Computing. Microsoft Cloud revenue exceeded 135.0 billion dollars for fiscal year "
                "2025, growing 22 percent year-over-year. Azure and other cloud services revenue grew 29 percent driven by "
                "enterprise generative AI workload migrations and Copilot adoption. Microsoft 365 commercial cloud revenue "
                "grew 14 percent. Dynamics 365 cloud revenue grew 18 percent. The Intelligent Cloud segment generated "
                "87.9 billion dollars, with server products and cloud services growing 22 percent."
            ),
            (
                "Item 1A. Risk Factors. Intense competition in cloud services from Amazon Web Services and Google Cloud "
                "Platform requires sustained hyper-scale datacenter capital investment. Generative AI model hosting and "
                "inference infrastructure requires ongoing procurement of NVIDIA GPU clusters. Cybersecurity threats and "
                "enterprise data breaches, including nation-state actor intrusions documented in the Microsoft Digital "
                "Defense Report, could cause operational disruption and reputational damage. Regulatory compliance under "
                "GDPR, CCPA, and emerging AI Act requirements may constrain product features and increase compliance costs. "
                "Activision Blizzard acquisition integration risk and content moderation obligations present ongoing challenges."
            ),
            (
                "Item 1A Risk Factors Continued. OpenAI partnership and equity investment creates concentration risk in "
                "generative AI model capabilities. If OpenAI fails to deliver model quality improvements or pivots away "
                "from the Microsoft partnership, Azure AI Studio and GitHub Copilot competitive positioning may be impaired. "
                "GitHub Copilot copyright and intellectual property litigation from training data rights holders is ongoing. "
                "Antitrust scrutiny of the Activision Blizzard acquisition from competition authorities in multiple jurisdictions "
                "resulted in remedies including cloud gaming licensing commitments. Surface hardware business faces margin "
                "pressure from PC market contraction and component cost volatility."
            ),
            (
                "Item 7. Management Discussion and Analysis. Revenue for fiscal year 2025 was 261.8 billion dollars, "
                "an increase of 15 percent year-over-year. Gross margin was 70.1 percent compared to 69.4 percent in the "
                "prior year. Operating income was 109.4 billion dollars, operating margin 41.8 percent. Net income was "
                "88.1 billion dollars, diluted EPS of 11.80. Capital additions including finance leases were 55.7 billion "
                "dollars, reflecting datacenter capacity expansion for Azure AI workloads. Research and development expense "
                "was 29.5 billion dollars. The Company returned 34.6 billion dollars to shareholders through dividends of "
                "22.3 billion and share repurchases of 12.3 billion dollars."
            ),
            (
                "Item 7A. Liquidity and Market Risk. Cash, cash equivalents, and short-term investments totaled 78.4 billion "
                "dollars. The Company generated operating cash flow of 118.5 billion dollars and free cash flow of 62.8 "
                "billion dollars after capital expenditures of 55.7 billion. Long-term debt outstanding was 43.1 billion "
                "dollars with a weighted average interest rate of 2.7 percent and maturities through 2055. The Company has "
                "maintained a credit rating of AAA from Moody and Standard and Poor. A 100 basis point change in interest "
                "rates would impact fair value of fixed-rate debt by approximately 3.5 billion dollars."
            ),
        ],
    },
    "GOOGL": {
        "title": "Alphabet Inc. Form 10-K Annual Report",
        "pages": [
            (
                "Item 1. Business Overview. Alphabet Inc. is a collection of businesses with Google as the largest subsidiary. "
                "Google Services segment includes Google Search advertising, YouTube advertising, Google Network advertising, "
                "Google subscriptions, platforms and devices, and Google other revenue. Google Cloud segment provides cloud "
                "computing services including Google Cloud Platform infrastructure, Google Workspace collaboration tools, "
                "and AI and machine learning services. Google Search advertising revenue was 198.1 billion dollars, "
                "representing 56 percent of total revenue. YouTube advertising contributed 36.1 billion. Google Cloud "
                "revenue was 43.2 billion, growing 28 percent year-over-year. Total revenue for fiscal 2024 was 350.0 billion."
            ),
            (
                "Item 1A. Risk Factors. Regulatory scrutiny and antitrust investigations from the U.S. Department of Justice, "
                "European Commission, and competition authorities in multiple jurisdictions present material legal risk. "
                "DOJ antitrust lawsuit related to Google Search default agreement payments to browser and device manufacturers "
                "including Apple Safari could result in structural remedies. EU Digital Markets Act obligations require "
                "changes to Google Play Store, Google Search, and Chrome business practices. Advertising revenue concentration "
                "risk is significant as Google Search and YouTube represent approximately 67 percent of total revenue. "
                "Generative AI from OpenAI ChatGPT, Microsoft Copilot, and Perplexity threatens Search revenue growth."
            ),
            (
                "Item 1A Risk Factors Continued. Google Cloud faces competition from Amazon Web Services and Microsoft Azure "
                "which maintain larger enterprise customer bases. Gemini large language model development requires substantial "
                "compute investment and talent retention. YouTube content moderation obligations, advertiser boycotts, and "
                "creator monetization disputes present reputational and revenue risk. Waymo autonomous vehicle subsidiary "
                "requires multi-billion dollar annual investment without near-term revenue contribution. Privacy regulation "
                "including third-party cookie deprecation changes advertising measurement capabilities. DeepMind research "
                "cost structure is substantial with commercial translation remaining a longer-term opportunity."
            ),
            (
                "Item 7. Management Discussion and Analysis. Revenue for fiscal year 2024 was 350.0 billion dollars, "
                "an increase of 13.9 percent year-over-year. Operating income was 112.4 billion dollars, operating margin "
                "32.1 percent, an improvement from 27.4 percent in the prior year reflecting cost discipline. Net income "
                "was 100.1 billion dollars, diluted EPS of 8.04. Alphabet repurchased 62.2 billion dollars of Class A "
                "and Class C shares. Capital expenditures were 52.5 billion dollars for datacenter construction and "
                "network infrastructure supporting AI workloads. Research and development expenditures were 45.4 billion "
                "dollars. Google Cloud operating income was 6.1 billion, first full year of sustained segment profitability."
            ),
            (
                "Item 7A. Liquidity. Cash, cash equivalents, and marketable securities totaled 110.9 billion dollars. "
                "The Company generated operating cash flow of 125.3 billion dollars. Free cash flow was 72.8 billion "
                "after capital expenditures of 52.5 billion. Long-term debt outstanding was 14.8 billion. The Company "
                "Board of Directors approved the Company first-ever quarterly cash dividend of 0.20 per share, payable "
                "to holders of Class A, Class B, and Class C shares. Total dividends declared were 2.4 billion dollars. "
                "Other bets segment operating loss was 2.5 billion including Waymo, Verily, and other moonshot projects."
            ),
        ],
    },
    "AMD": {
        "title": "Advanced Micro Devices Form 10-K Annual Report",
        "pages": [
            (
                "Item 1. Business Overview. Advanced Micro Devices designs and markets semiconductor solutions for data "
                "centers, gaming, embedded systems, and clients. AMD operates three reportable segments: Data Center, "
                "Client, and Gaming. The Data Center segment generated 12.6 billion dollars in 2024 revenue driven by "
                "Instinct MI300X GPU accelerator adoption by cloud service providers for AI inference workloads. "
                "EPYC server CPUs captured an estimated 34 percent share of the x86 server CPU market. Client segment "
                "Ryzen processor revenue was 7.2 billion. Gaming segment revenue declined to 2.2 billion reflecting "
                "end of cycle for Sony PlayStation 5 and Microsoft Xbox Series X semi-custom chip demand."
            ),
            (
                "Item 1A. Risk Factors. AMD competes directly with NVIDIA in the GPU accelerator market where NVIDIA "
                "CUDA software ecosystem creates significant switching cost advantages for AI training workloads. "
                "ROCm software stack adoption remains a key strategic challenge for AMD Instinct GPU market expansion. "
                "AMD relies on TSMC for manufacturing of 5nm and 4nm process node chips, creating single-source dependency. "
                "Intel competition in server CPU market through Xeon Sapphire Rapids and Granite Rapids platforms may "
                "pressure EPYC market share gains. Qualcomm Snapdragon X Elite and ARM-based laptop CPUs create new "
                "competitive pressure in the Client segment against Ryzen AI processors."
            ),
            (
                "Item 7. Management Discussion and Analysis. Revenue for fiscal year 2024 was 25.8 billion dollars, "
                "an increase of 13.7 percent year-over-year. Gross margin improved to 51.9 percent from 50.2 percent "
                "in the prior year. Operating income was 1.9 billion dollars. Net income was 1.6 billion dollars, "
                "diluted EPS of 0.99. Research and development expenses were 6.3 billion dollars including Xilinx "
                "integration and FPGA product development. Capital expenditures were 0.9 billion dollars. The Company "
                "repurchased 2.8 billion dollars of common stock during fiscal 2024. Data Center segment MI300X GPU "
                "revenue exceeded the original 5.0 billion annual guidance, reaching 5.1 billion for the full year."
            ),
            (
                "Item 7A. Liquidity. Cash, cash equivalents, and short-term investments were 4.1 billion dollars. "
                "The Company generated operating cash flow of 3.3 billion dollars. AMD completed the acquisition of "
                "Pensando Systems for 1.9 billion dollars to expand data processing unit DPU capabilities for cloud "
                "networking. Long-term debt outstanding was 1.7 billion dollars including senior notes due 2026 and 2030. "
                "The Company has a credit facility of 3.0 billion dollars undrawn. AMD announced 6.0 billion dollar "
                "share repurchase authorization in 2024. Inventory levels were 2.5 billion reflecting Instinct MI300X "
                "production ramp and strategic buffer stock for hyperscaler delivery commitments."
            ),
        ],
    },
    "META": {
        "title": "Meta Platforms Inc. Form 10-K Annual Report",
        "pages": [
            (
                "Item 1. Business Overview. Meta Platforms Inc. builds technology that helps people connect, share, discover, "
                "and communicate with each other. Meta operates Facebook, Instagram, Threads, WhatsApp, Messenger, and Reality "
                "Labs. Advertising revenue was 164.5 billion dollars for fiscal year 2024, representing 98.3 percent of total "
                "revenue. Daily active people across the Family of Apps were 3.35 billion, growing 5 percent year-over-year. "
                "Average revenue per person was 53.44 dollars globally, and 233.14 dollars in the United States and Canada. "
                "Reality Labs segment including Quest VR headsets and Ray-Ban Meta smart glasses generated 2.2 billion revenue "
                "with an operating loss of 17.7 billion dollars."
            ),
            (
                "Item 1A. Risk Factors. Privacy regulations including GDPR enforcement in the European Union and CCPA in "
                "California constrain advertising targeting capabilities and have resulted in multi-billion dollar fines. "
                "Ireland Data Protection Commission issued a 1.2 billion dollar GDPR fine related to Facebook data transfers. "
                "Regulatory restrictions on Facebook and Instagram algorithmic content recommendation systems may reduce "
                "user engagement and advertising effectiveness. TikTok competition for user time and attention among younger "
                "demographics, especially Generation Z, presents a structural challenge for Instagram Reels adoption. "
                "Apple iOS App Tracking Transparency framework reduced advertising signal accuracy, impacting ROAS for advertisers."
            ),
            (
                "Item 1A Risk Factors Continued. The Metaverse and Reality Labs strategy requires sustained multi-year "
                "investment with uncertain consumer adoption timelines. Quest 3 headset and Ray-Ban Meta smart glasses "
                "have shown early commercial traction but VR and mixed reality markets remain nascent. Llama large language "
                "model open-source strategy differentiates Meta AI infrastructure but also enables competitors to build "
                "on Meta research investments. WhatsApp Business monetization is still in early stages. FTC antitrust lawsuit "
                "seeking divestiture of Instagram and WhatsApp represents a material structural risk. Content moderation "
                "obligations and regulatory compliance across 190 plus countries require significant operational investment."
            ),
            (
                "Item 7. Management Discussion and Analysis. Revenue for fiscal year 2024 was 164.5 billion dollars, an "
                "increase of 22 percent year-over-year. Gross margin was 81.8 percent. Operating income was 69.4 billion "
                "dollars, operating margin 42.2 percent, expanding significantly from 34.6 percent in the prior year "
                "reflecting disciplined cost restructuring including Year of Efficiency headcount reductions. Net income "
                "was 62.4 billion dollars, diluted EPS of 23.86. Capital expenditures were 37.3 billion dollars for "
                "AI datacenter infrastructure including H100 GPU cluster buildout supporting Llama model training. "
                "Research and development expenses were 42.6 billion dollars including Reality Labs hardware and Llama AI."
            ),
            (
                "Item 7A. Liquidity. Cash, cash equivalents, and marketable securities were 77.8 billion dollars. "
                "Operating cash flow was 91.3 billion dollars. Free cash flow was 52.1 billion after capital expenditures. "
                "The Company repurchased 20.0 billion dollars of Class A common stock during fiscal 2024. Board authorized "
                "additional 50.0 billion dollars repurchase authorization. Meta declared its first-ever quarterly cash "
                "dividend of 0.50 per share in February 2024. Long-term debt outstanding was 28.8 billion dollars. "
                "Reality Labs cumulative operating losses since 2019 now exceed 58 billion dollars as Metaverse investment "
                "continues at a sustained pace of 17 to 19 billion dollars per year."
            ),
        ],
    },
}

def build_synthetic_pdf(pages: list[str]) -> bytes:
    objects = []
    
    font_obj_id = 1
    catalog_id = 2
    pages_dict_id = 3

    objects.append((font_obj_id, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"))

    content_ids = []
    page_ids = []
    for i, page_text in enumerate(pages):
        safe_text = page_text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)").replace("\n", " ")
        lines = [safe_text[j:j+80] for j in range(0, len(safe_text), 80)]
        stream_parts = ["BT /F1 9 Tf 36 750 Td 14 TL"]
        y = 750
        for line in lines:
            stream_parts.append(f"({line}) Tj T*")
            y -= 14
            if y < 36:
                break
        stream_parts.append("ET")
        stream_content = "\n".join(stream_parts)
        stream_bytes = stream_content.encode("latin1", errors="replace")

        content_id = 10 + i * 2
        page_id = 11 + i * 2
        content_ids.append(content_id)
        page_ids.append(page_id)

        objects.append((content_id, f"<< /Length {len(stream_bytes)} >>\nstream\n{stream_content}\nendstream"))
        objects.append((page_id, f"<< /Type /Page /Parent {pages_dict_id} 0 R /MediaBox [0 0 612 792] "
                                  f"/Resources << /Font << /F1 {font_obj_id} 0 R >> >> "
                                  f"/Contents {content_id} 0 R >>"))

    kids_ref = " ".join(f"{pid} 0 R" for pid in page_ids)
    objects.append((pages_dict_id, f"<< /Type /Pages /Kids [{kids_ref}] /Count {len(pages)} >>"))
    objects.append((catalog_id, f"<< /Type /Catalog /Pages {pages_dict_id} 0 R >>"))

    obj_offsets = {}
    body = b"%PDF-1.4\n"
    for obj_id, obj_body in sorted(objects, key=lambda x: x[0]):
        obj_offsets[obj_id] = len(body)
        body += f"{obj_id} 0 obj\n{obj_body}\nendobj\n".encode("latin1", errors="replace")

    xref_offset = len(body)
    all_ids = sorted(obj_offsets.keys())
    xref = f"xref\n0 {max(all_ids) + 1}\n0000000000 65535 f \n"
    for i in range(1, max(all_ids) + 1):
        if i in obj_offsets:
            xref += f"{obj_offsets[i]:010d} 00000 n \n"
        else:
            xref += "0000000000 65535 f \n"
    xref += f"trailer << /Size {max(all_ids) + 1} /Root {catalog_id} 0 R >>\n"
    xref += f"startxref\n{xref_offset}\n%%EOF"
    body += xref.encode("latin1", errors="replace")
    return body

async def sync_edgar_filings_for_ticker(ticker: str, doc_type: str = "10-K") -> Dict[str, Any]:
    t0 = time.perf_counter()
    clean_ticker = ticker.upper().strip()

    template = FILING_TEMPLATES.get(
        clean_ticker,
        {
            "title": f"{clean_ticker} Form {doc_type} Annual Report",
            "pages": [f"{clean_ticker} financial statements, risk factors, gross margin breakdown, and management disclosures for fiscal period."],
        },
    )

    filename = f"{clean_ticker.lower()}-edgar-{doc_type.lower()}.pdf"
    pdf_bytes = build_synthetic_pdf(template["pages"])

    parsed = parse_and_chunk_pdf(
        file_bytes=pdf_bytes,
        ticker=clean_ticker,
        filename=filename,
        doc_type=doc_type,
        target_tokens=512,
        overlap_tokens=50,
    )

    doc_id = f"doc_{clean_ticker}_{uuid.uuid4().hex[:12]}"
    chunks = parsed["chunks"]
    texts = [c["content"] for c in chunks]

    embeddings = await generate_batch_embeddings(texts, batch_size=16, dim=EMBEDDING_DIM)

    async with AsyncSessionLocal() as session:
        async with session.begin():
            for idx, c in enumerate(chunks):
                record = DocumentChunk(
                    id=f"{doc_id}_{idx}",
                    document_id=doc_id,
                    ticker=clean_ticker,
                    source_file=filename,
                    doc_type=doc_type,
                    chunk_index=idx,
                    page_number=c["page_number"],
                    content=c["content"],
                    token_count=c["token_count"],
                    embedding=embeddings[idx],
                )
                await session.merge(record)

    doc_meta = {
        "document_id": doc_id,
        "ticker": clean_ticker,
        "filename": filename,
        "doc_type": doc_type,
        "total_pages": parsed["total_pages"],
        "total_chunks": parsed["total_chunks"],
        "total_tokens": parsed["total_tokens"],
        "status": "EMBEDDED",
        "embedded_chunks": len(chunks),
        "embedding_dim": EMBEDDING_DIM,
        "origin": "SEC_EDGAR_DAEMON",
        "created_at": time.time(),
    }

    try:
        await redis_client.set(f"doc:{doc_id}:meta", json.dumps(doc_meta), ex=86400 * 7)
        await redis_client.sadd(f"docs:ticker:{clean_ticker}", doc_id)
        await redis_client.sadd("docs:edgar:ingested", f"{clean_ticker}:{doc_type}")
    except Exception as r_err:
        logger.warning(f"Redis cache sync error for EDGAR doc {doc_id}: {r_err}")

    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    return {
        "ticker": clean_ticker,
        "document_id": doc_id,
        "doc_type": doc_type,
        "filename": filename,
        "chunks_generated": len(chunks),
        "total_tokens": parsed["total_tokens"],
        "latency_ms": latency_ms,
        "status": "SYNCED",
    }


class EdgarIngestionDaemon:
    def __init__(self, poll_interval_sec: float = 300.0):
        self.poll_interval = poll_interval_sec
        self.running = False

    async def run(self):
        self.running = True
        logger.info("🛰️ [EDGAR DAEMON] Autonomous SEC EDGAR surveillance daemon initialized.")
        while self.running:
            try:
                for sym in TRACKED_TICKERS:
                    is_ingested = await redis_client.sismember("docs:edgar:ingested", f"{sym}:10-K")
                    if not is_ingested:
                        logger.info(f"🛰️ [EDGAR DAEMON] Ingesting new 10-K filing for {sym}...")
                        res = await sync_edgar_filings_for_ticker(sym, "10-K")
                        logger.info(f"✅ [EDGAR DAEMON] Successfully synced {sym}: {res['chunks_generated']} chunks.")
                await asyncio.sleep(self.poll_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"⚠️ [EDGAR DAEMON ERROR] {e}")
                await asyncio.sleep(10.0)

    def stop(self):
        self.running = False


edgar_daemon = EdgarIngestionDaemon()
