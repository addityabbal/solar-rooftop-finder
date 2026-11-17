# Mailing postcards in India: what we found

Checked 17 November 2026 with two web searches. Confidence is low; confirm with a post office before spending money.

## Finding

No public India Post API for sending letters or postcards was found. The only programmatic
services that turned up are third-party parcel tracking APIs, which do not send mail.
No Indian print-and-post API vendor was confirmed either.

## Recommendation

Post by hand-off, not by API, until volume justifies a vendor contract.

| Option | What it is | Fits us? |
| --- | --- | --- |
| India Post Business Post | Bulk mailing service that can include printing, inserting and addressing. Arranged at a Business Post Centre. | Best fit: our cards are addressed to "The Owner" at a postal address. |
| India Post Direct Post | Unaddressed advertising mail, accepted in bulk at designated offices. | Only if you drop the per-roof personalisation. Cards carry no address, so the per-roof QR code loses its meaning. |
| Local printer + ordinary post | Print the PDFs, stamp and post them yourself. | Fine for a first test of 50 cards. |

Tariffs, minimum quantities and size rules were not found online. Ask the Business Post
Centre for: the rate for a 6 x 4 inch card, the minimum batch, and whether "The Owner"
is accepted as the addressee.

## How the app supports this

1. Download each postcard PDF from the campaign dashboard, Postcards tab.
2. Print and hand them over.
3. With `MAILING_ENABLED=true` and `CAMPAIGN_INSTALLER_NAME` set, a "Mark as posted" button
   appears. It only records the hand-off in the activity log. Nothing is sent by the app.

Keep `MAILING_ENABLED` unset until a real installer backs the campaign. A card that
promises a site visit needs someone to make the visit, and their name and licence
details belong on the card.

## Sources

- https://indiapost.gov.in/MBE/Pages/Content/Direct-Post.aspx
- https://tamilnadupost.cept.gov.in/business-related-services.php
- https://postandparcel.info/13363/news/direct-post-service-launched-in-india/
