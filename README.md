# Insight Eye

"Build a multi-tenant SaaS web application for enterprise video surveillance analytics, sold to multiple client organizations (factories, public institutions, logistics sites). Each client's security team uploads or streams footage and gets structured, actionable data — not just raw playback.

Core features:

Multi-tenant architecture — each client org has isolated cameras, footage, users, and data; a super-admin view for Fikra Studio to manage all tenants.

Video ingestion — uploaded files (MP4/AVI) at launch; RTSP live-feed support as a later tier.

Detection & classification (via pluggable AI provider — swappable between cloud API and on-prem inference later):

People — count, entry/exit, loitering, restricted-zone entry

Vehicles — type, direction, plate region if visible

Animals — for perimeter/agricultural or waste sites

Objects of interest — unattended bags, open doors/gates

Event timeline — searchable log: timestamp, entity type, confidence score, linked clip/snapshot.

Alerts — configurable rules → email/SMS/dashboard notification to assigned agents.

Dashboard — active cameras, today's events by category, activity heatmap.

Search & filter — date range, camera/zone, entity type.

Export — PDF/Excel incident reports per event or time range.

Roles — admin, security agent, viewer, with per-camera/zone permissions.

Billing/subscription layer — per-tenant plan tiers (e.g. by camera count or storage), since this is a sellable product.

Bilingual UI — French/Arabic with RTL support, English optional.

Technical constraints:

Frontend: React + Tailwind

Backend: Node/Express or similar, with per-tenant data isolation

AI detection: start with a cloud vision API behind an abstraction layer, so on-prem/edge inference can be swapped in later for clients with poor connectivity or data-residency needs

Deployment: cloud-hosted SaaS, with an offline/on-prem tier as a premium option for industrial clients

Prioritize a clean, low-clutter dashboard suited for a security operations room — dark mode, high-contrast alerts, minimal cognitive load."

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b139891e-876e-4a33-9385-966c98946918).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
