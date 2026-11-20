# Solar Rooftop Finder — PRD (v1)

**User.** A small solar installer in tier-2 and tier-3 India who today finds customers by door-knocking.

**Problem.** PM Surya Ghar cut payback for homes, but finding roofs worth a site visit is still manual.

**v1 promise.** Type a 6-digit pincode, get the roofs in that area ranked by a lead score, each with
usable roof area (sq ft), system size, yearly units and rupees saved after subsidy, payback, an
approximate address with a Plus Code, and a public business phone or website where one exists.
Plus an AI-written summary of the pincode in English and Hindi and a WhatsApp-length pitch.

**Constraints.** ₹0 a month on free tiers. No personal data about residents. Every number traceable
to a named assumption.

**In v1.** Pincode → centre and 3 km square; Overture footprints; NASA sunlight; tariff and subsidy
tables; road + Plus Code addresses; public business contacts; AI summary with guardrails; opt-in
quote form with consent; on-demand builds via GitHub Actions with a daily cap.

**Not in v1, on purpose.** Residents' phone numbers or names (DPDP Act 2023; homes come in through the
opt-in form). Our own imagery or roof-detection model. Shading, tilt and obstructions (a fixed usable
share, stated in the UI).

**Success.** Roof area median error ≤ 20%; 100% number faithfulness; Hindi rated ≥ 4/5; two real
installers say how many of the top 20 leads they would call.
