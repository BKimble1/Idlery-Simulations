# FAB / ONE: four simulations, with Automotive V2

**Download:** [`FAB_ONE_Four_Simulations_Automotive_V2_Netlify.zip`](https://github.com/BKimble1/Idlery-Simulations/raw/release/fab-one-four-simulations-automotive-v2/FAB_ONE_Four_Simulations_Automotive_V2_Netlify.zip) (a direct download)

| | |
|---|---|
| size | 35,858,693 bytes (34.2 MiB) |
| files | 323 |
| SHA-256 | `1a0832be5c73277d7d5a2fc118ee6064d8621954855555425db98bb7d612a9ca` (also in the `.sha256` file) |
| site source | [`claude/automotive-v2`](https://github.com/BKimble1/Idlery-Simulations/tree/claude/automotive-v2), packaged at `fa1b811` (the release record was added afterwards, in `86eca3d`) |

The ZIP holds the whole FAB / ONE site, built and ready for Netlify. It has four cards, each at
its own route:

| card | route |
|---|---|
| 01 Photolithography | `/photolithography` |
| 02 Rocket Flight & Mission Simulation | `/rocket` |
| 03 Humanoid V2 | `/humanoid` |
| 04 Automotive V2 | `/automotive` |

The record of this release is [`RELEASE.md`](RELEASE.md). It is the same file as
`docs/release-automotive-v2.md` on the site branch, and covers:

* the source commits;
* the tests actually run;
* before-and-after evidence;
* measured performance;
* the known limitations.

The pictures, clips and measurements it refers to are in [`evidence/`](evidence/).

## Uploading it to Netlify

Making this ZIP is not a deployment. Nothing has been uploaded.

1. Download the ZIP and unzip it.
2. Check the folder. It should have `index.html`, `404.html`, `_redirects`, `_headers`,
   `assets/`, `media/`, `photolithography/`, `rocket/`, `humanoid/` and `automotive/` at its
   top level. Use that folder, not a folder around it, and not the ZIP itself.
3. In Netlify, open the existing site's **Deploys** page. Drag the folder onto the upload area
   at the bottom of the page.
4. The deploy summary should report 4 redirect rules and 10 header rules.
5. Check the site:
   * `/`, `/photolithography`, `/rocket`, `/humanoid` and `/automotive`, also after a refresh;
   * deep links such as `/automotive?mode=explore&system=brakes&part=brake-caliper`,
     `/humanoid?mode=simulate&lab=walk` and `/rocket?v=mission&m=leo`.
