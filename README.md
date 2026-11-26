# লিফট রাইড টেস্ট (Lift Ride Test) — v2.1.1

ফোনের sensor দিয়ে লিফটের **speed, travel height, vibration ও jerk** মাপার অ্যান্ড্রয়েড অ্যাপ। এই সংস্করণ **ISO 18738:2003** পদ্ধতি অনুযায়ী, অ্যাপের ভাষা **ইংরেজি**, এবং **শুধু accelerometer দিয়েই** পুরো মাপ চলে (barometer ঐচ্ছিক)।

*Design & Developed by Md. Saiful Islam*

**v2.1.1-এ নতুন:**

- **Login ও access request:** ইউজার নিজে অনুরোধ পাঠায়, আর আপনি (admin) অনুমোদন দিলে তবে অ্যাপ চলে।
- **Send:** ইউজার চাইলে একটি রেকর্ড আপনার **Google Drive**-এ পাঠায়।
- **PC সংস্করণ:** একই অ্যাপ PWA হিসেবে চলে, আর Admin ট্যাবে সবার রেকর্ড খুলে পুরো বিশ্লেষণ, PDF ও CSV পাওয়া যায়।
- **নাম:** অ্যাপের নাম এখন **Lift Ride Test** (আগে Lift Ride Meter)। App ID আগের মতোই, তাই ফোনে আগের অ্যাপের ওপরেই update হবে এবং পুরোনো রেকর্ড থাকবে।
- **শুরুর ঝাঁকুনি সংশোধন:** Start চাপার মুহূর্তের ঝাঁকুনি (বা কিছু ফোনের প্রথম কয়েকটি ভুল sample) আর vibration গ্রাফে বড় spike বা বাড়তি noise floor দেখায় না। এতে ভুল "close to sensor noise" সতর্কবার্তাও আর আসে না। মূল ফলাফলের হিসাব একই থাকে।

---

## ক. v2.1.1 — টিম ক্লাউড ও PC সংস্করণ

| বিষয় | কীভাবে কাজ করে |
|---|---|
| সাইটে মাপা | ইউজার **APK** দিয়ে মাপে (200 Hz, barometer থাকলে সেটাও)। রেকর্ড **ফোনেই** থাকে, PDF আগের মতো চলে |
| পাঠানো | History বা Results-এর **Send** বোতাম চাপলে তবেই পাঠায়। ইন্টারনেট না থাকলে "Queued" হয়, নেট ফিরলে নিজে যায় |
| কী যায় | কাঁচা sensor ডেটা (gzip করা `.json.gz`) আপনার Drive-এর `LiftRideTest-Data` ফোল্ডারে যায়। সারাংশ যায় Google Sheet-এর `Records` শিটে |
| Login | Sign-in পাতায় **Request access** আছে: নাম, ID, Section, Email, Password। ID-ই হলো login ID |
| অনুমোদন | অনুরোধ এলে আপনার Gmail-এ ইমেইল আসে, আর অ্যাপের **Admin** ট্যাবে লাল সংখ্যা দেখায়। Approve চাপলে ইউজারকেও ইমেইল যায় |
| ভূমিকা | **User** শুধু নিজের পাঠানো রেকর্ড পায়। **Admin** সবার রেকর্ড দেখে এবং ইউজার যোগ, বন্ধ ও পাসওয়ার্ড reset করে। প্রতিটি অনুরোধ সার্ভারে আবার যাচাই হয় |
| PC সংস্করণ | `www` ফোল্ডারটি GitHub Pages-এ চলে। Chrome বা Edge-এ **Install** দিলে নিজের আইকনসহ আলাদা অ্যাপ হয়ে যায় |
| ইন্টারনেট ছাড়া PC-তে | ফোন থেকে **Reading file** (`.lrm.json`) WhatsApp বা ইমেইলে পাঠিয়ে PC-তে **History → Import reading file** দিয়ে খুলুন |
| Demo | Cloud URL-এ `demo` লিখলে ব্রাউজারের ভেতরে কাল্পনিক সার্ভার চলে। ইউজার `admin / admin123` ও `demo / demo123` |

> **মোবাইলে PWA বনাম APK:** ব্রাউজার বা PWA মোবাইলে accelerometer প্রায় ৫০–৬০ Hz দেয়, আর barometer দেয় না। APK-তে 200 Hz ও barometer পাওয়া যায়। তাই **মাঠে APK** ব্যবহার করুন, আর **PC-তে PWA**।

---

## ক১. আগে থেকে চালু repo-তে নতুন সংস্করণ তোলা (প্রথমে এটা করুন)

আপনার `Lift-Ride-Test` repo-তে আগের সংস্করণ আছে। তাতে `config.js`, `backend` ফোল্ডার, PWA ফাইল ও আইকন নেই। নিচের অংশ **খ** ও **গ** কাজ করবে শুধু এই ধাপের পরে।

| কোথায় | নতুন ফাইল |
|---|---|
| `www/` | `config.js`, `manifest.webmanifest`, `sw.js` |
| `www/icons/` | `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` |
| `www/js/` | `backend.js`, `cloudlogic.js` (বাকি ফাইলগুলোও বদলেছে) |
| রুটে | `backend/` ফোল্ডার, `.github/workflows/pages.yml` |

1. `LiftRideTest-repo.zip` PC-তে extract করুন।
2. GitHub-এ repo-র **মূল পাতায়** যান (`www`-এর ভেতরে নয়)। **Add file → Upload files** চাপুন।
3. extract করা ফোল্ডারের **ভেতরের সবকিছু** (`www`, `backend`, `native`, `scripts`, `tests`, `docs`, `README.md`, `package.json`, `capacitor.config.json`) একসঙ্গে select করে টেনে ছাড়ুন। ফোল্ডারের গঠন ঠিক থাকে, আর একই নামের পুরোনো ফাইল বদলে যায়।
4. নিচে **Commit changes** চাপুন।
5. লুকানো `.github` ফোল্ডার আপলোডে বাদ পড়ে, তাই এগুলো হাতে করুন:
    - **build-apk.yml বদলানো:** `.github/workflows/build-apk.yml` খুলে ✏ চাপুন। সব লেখা মুছে প্যাকেজের আলাদা `build-apk.yml`-এর লেখা পেস্ট করে **Commit changes** চাপুন।
    - **pages.yml যোগ করা:** **Add file → Create new file** চাপুন। নাম দিন `.github/workflows/pages.yml`। প্যাকেজের আলাদা `pages.yml`-এর লেখা পেস্ট করে **Commit changes** চাপুন।
    - `.java-version` আগে থেকেই আছে, এটা আর লাগবে না।
6. যাচাই: `www` ফোল্ডারে `config.js`, `manifest.webmanifest`, `sw.js` ও `icons` দেখা গেলে ঠিক আছে।

> ফোনে নতুন APK আগের অ্যাপের ওপরেই বসবে (App ID একই), তাই পুরোনো রেকর্ড মুছবে না।

---

## খ. ক্লাউড সেটআপ — একবারই (Google Sheet + Apps Script)

**১. Google Sheet বানান**

1. drive.google.com → বাঁয়ের **+ New** → **Google Sheets** → **Blank spreadsheet**।
2. ওপরের নাম `Untitled spreadsheet`-এ ক্লিক করে লিখুন `LiftRideTest`।

**২. কোড বসান**

1. Sheet-এর মেনু **Extensions → Apps Script**। নতুন ট্যাব খুলবে।
2. বাঁয়ে `Code.gs` খোলা থাকবে। ভেতরের সব লেখা মুছে প্যাকেজের **`Code.gs`** ফাইলের পুরো লেখা পেস্ট করুন।
3. ফাইলের একদম ওপরে, CloudLogic অংশের পরে `STEP 1` লেখা জায়গায় নিচের মানগুলো দিন:
    - `ADMIN_USER`: আপনার login ID, যেমন `saiful`।
    - `ADMIN_PASS`: শক্ত পাসওয়ার্ড, ৬ অক্ষরের বেশি।
    - `ADMIN_NAME`: `Md. Saiful Islam`।
    - `NOTIFY_EMAIL`: খালি রাখলে আপনার Gmail-এই অনুরোধের ইমেইল আসবে।
4. **Ctrl+S** দিয়ে সেভ করুন।

**৩. setup চালান (একবার)**

1. ওপরের টুলবারে ফাংশনের তালিকা থেকে **setup** বেছে **▶ Run** চাপুন।
2. "Authorization required" এলে **Review permissions** চাপুন, আপনার অ্যাকাউন্ট বাছুন।
3. "Google hasn't verified this app" এলে **Advanced → Go to … (unsafe) → Allow** চাপুন। এটা আপনার নিজের স্ক্রিপ্ট, তাই নিরাপদ।
4. নিচে "Execution completed" আসবে, আর আপনার Gmail-এ **"backend ready"** ইমেইল আসবে।
5. এখন `ADMIN_PASS`-এর পাসওয়ার্ড মুছে আবার `'CHANGE-ME-123'` লিখে সেভ করুন। পাসওয়ার্ড Sheet-এ hash হয়ে আছে, কোডে আর দরকার নেই।

**৪. Web app হিসেবে প্রকাশ**

1. ডানে ওপরে **Deploy → New deployment**।
2. বাঁয়ের ⚙ চাকায় ক্লিক করে **Web app** বাছুন।
3. **Execute as: Me**, আর **Who has access: Anyone** দিন। দ্বিতীয়টি বাধ্যতামূলক, নাহলে অ্যাপ ডেটা পাবে না।
4. **Deploy** চাপুন, তারপর **Web app URL** কপি করুন। এটা `/exec` দিয়ে শেষ হবে।
5. পরীক্ষা: URL-টি ব্রাউজারে খুললে `{"ok":true,"app":"Lift Ride Test backend",...}` দেখাবে।

> পরে কোড বদলালে **Deploy → Manage deployments → ✏ (Edit) → Version: New version → Deploy** চাপুন। এতে URL একই থাকে। নতুন deployment বানালে URL বদলে যায়।

**৫. URL অ্যাপে বসান (সবার জন্য একবারে)**

1. GitHub repo → `www` → `config.js` → ✏ পেন্সিল। (`config.js` না থাকলে আগে অংশ **ক১** করুন।)
2. `cloudUrl: ""`-এর দুই উদ্ধৃতির মাঝে URL পেস্ট করুন। যেমন `window.LRM_CONFIG = { cloudUrl: "https://script.google.com/macros/s/AKfy.../exec" };`
3. **Commit changes** চাপুন। নতুন APK ও PC সংস্করণ নিজে তৈরি হবে।

এরপর অ্যাপ খুললেই প্রথমে **Sign in** পাতা আসবে, আর URL কেউ বদলাতে পারবে না।

---

## গ. PC ও মোবাইল ওয়েব অ্যাপ (PWA)

**GitHub Pages (বিনামূল্যে):**

1. প্যাকেজের `pages.yml` ফাইলটি repo-তে `.github/workflows/pages.yml` হিসেবে রাখুন। দুই উপায়:
    - **Add file → Create new file**, নাম লিখুন `.github/workflows/pages.yml`, তারপর লেখা পেস্ট করুন।
    - অথবা **Actions → New workflow → set up a workflow yourself**।
2. **Settings → Pages → Build and deployment → Source: GitHub Actions** বাছুন।
3. ⚠ **GitHub Free প্ল্যানে Pages শুধু public repo-তে চলে।** আপনার repo এখন private, তাই দুটি পথ:
    - **Settings → General → নিচে Danger Zone → Change visibility → Public** করুন। কোডে কোনো পাসওয়ার্ড বা ডেটা নেই। Cloud URL দেখা গেলেও login ছাড়া কিছু পাওয়া যায় না।
    - অথবা repo private রেখে **Netlify Drop** (নিচে) ব্যবহার করুন।
4. **Actions → Deploy web app (GitHub Pages) → Run workflow** চাপুন। সবুজ হলে ঠিকানা হবে: `https://saiful44711.github.io/Lift-Ride-Test/`

**Netlify Drop (repo private রাখতে চাইলে):** app.netlify.com/drop → অ্যাকাউন্টে sign in → প্যাকেজের `LiftRideTest-web.zip` খুলে `www` ফোল্ডারটি টেনে ফেলুন। একটি `https://…netlify.app` ঠিকানা পাবেন। আপডেটের সময় আবার টেনে ফেলতে হবে।

**PC-তে ইনস্টল:** Chrome বা Edge-এ ঠিকানাটি খুলুন। ঠিকানার ঘরের ডানে **Install** আইকন চাপুন, অথবা ⋮ → **Cast, save and share → Install page as app**। Start menu ও desktop-এ "Lift Ride Test" চলে আসবে।

**মোবাইলে PWA:** Chrome-এ ঠিকানা খুলে ⋮ → **Add to Home screen → Install** চাপুন। দ্রুত দেখার জন্য ভালো, মাঠের মাপের জন্য APK।

**PWABuilder (ঐচ্ছিক):** pwabuilder.com → ঠিকানা দিন → **Package for stores**। Windows (MSIX) বা Android প্যাকেজ বানাতে পারে। PWABuilder-এর Android প্যাকেজও ব্রাউজারের sensor ব্যবহার করে, তাই native 200 Hz পাবেন না।

---

## ঘ. প্রতিদিনের ব্যবহার

**ইউজার (সাইটে, APK):**

1. অ্যাপ খুলে **Request access** চাপুন, ঘরগুলো পূরণ করে **Send request** দিন।
2. অনুমোদনের ইমেইল এলে ID ও পাসওয়ার্ড দিয়ে **Sign in** করুন। একবার sign in করলে ৩০ দিন পর্যন্ত অফলাইনেও চলে।
3. মাপুন। Results-এ **PDF**, **CSV**, **Reading file** ও **Send to admin** বোতাম আছে।
4. History-তে প্রতিটি রেকর্ডের পাশে **Send** বোতাম আছে। পাঠানো হলে লেখা আসে "☁ Sent", নেট না থাকলে "☁ Queued"।

**আপনি (admin, PC):**

1. ইমেইল এলে PC অ্যাপের **Admin → Access requests** অংশে যান, **Approve** বা **Reject** চাপুন। অ্যাপ খোলা থাকলে **Desktop alerts** চালু করলে PC-তে নোটিফিকেশনও আসবে।
2. **Team records** অংশে খোঁজা, ইউজার ও দিক দিয়ে ছাঁকা যায়। **Open** চাপলে পুরো ISO বিশ্লেষণ, ১০টি চার্ট, PDF ও CSV পাবেন। Height সংশোধন করে আবার হিসাবও করা যায়।
3. **Summary CSV** দিয়ে ছাঁকা তালিকা Excel-এ নেওয়া যায়।
4. **Users** অংশে ইউজার যোগ, পাসওয়ার্ড reset ও Disable করা যায়। Disable করলে সাথে সাথে তার login বন্ধ হয়।

**নিরাপত্তা ও সীমা (সোজাসুজি):**

- পাসওয়ার্ড salt দেওয়া, ৩০০ ধাপের SHA-256 hash হিসেবে রাখা হয়, plain text নয়। Apps Script-এ bcrypt নেই, তাই ইউজারদের আলাদা পাসওয়ার্ড দিতে বলুন।
- ৫ বার ভুল পাসওয়ার্ড দিলে ১০ মিনিট login বন্ধ থাকে। Token ৩০ দিন চলে।
- `Records` ও `Users` শিটের **কলাম বদলাবেন না**। সারি পড়া ঠিক আছে।
- সাধারণ Gmail থেকে দিনে প্রায় ১০০টি ইমেইল যায়। একেকটি রেকর্ড সর্বোচ্চ প্রায় ৬ মিনিটের।
- কাল্পনিক (DEMO) ডেটা কখনো আসল ক্লাউডে যায় না।

---

## ০. v2.0.0-এ কী বদলেছে (আপডেট সারাংশ)

| # | বদল | কেন |
|---|---|---|
| 1 | অ্যাপের পুরো UI, PDF রিপোর্ট, সতর্কবার্তা, গাইড **ইংরেজিতে** | আপনার অনুরোধ |
| 2 | ত্বরণ/মন্দন/jerk: **10 Hz, 2-pole Butterworth** low-pass; jerk = **0.5 s running least-squares ঢাল** | ISO 18738 Table 1, 5.2, 5.3 (v1-এ আমি 2 Hz ধরেছিলাম, সেটা standard-এর সাথে মেলে না) |
| 3 | কম্পন: **ISO weighted** সংকেত (Wd: X,Y; Wk: Z), **zero-crossing peak-to-peak** (Annex A): Max ও **A95**, সাথে 0-peak | ISO 18738 4.3, 5.4 (v1-এ ১ সেকেন্ডের টুকরো ধরেছিলাম) |
| 4 | **Boundary 0–3**: B1/B2 = যাত্রা শুরুর ০.৫ m পরে / থামার ০.৫ m আগে (উচ্চতা থেকে) | ISO 18738 5.1 |
| 5 | Z কম্পন **constant ও non-constant acceleration region**-এ ভাগ (Annex B: ঢাল > 0.3 m/s³, ±0.5 s) | ISO 18738 5.4.3, Annex B |
| 6 | **Max ও A95 acceleration/deceleration**, **Max ও V95 speed** | ISO 18738 5.2, 5.5 |
| 7 | রিপোর্ট ফর্ম: Building, Lift ID, From/To floor, Persons, car fan/alarm, phone placement, Measured by, Organisation, Instrument ID, last check | ISO 18738 6.1–6.5 |
| 8 | **UP ও DOWN দুটোই মাপা হয়েছে কি না** ট্র্যাক করে | ISO 18738 6.4 |
| 9 | **Sensor self-check** (10 s): sampling rate, gravity (0 Hz), noise, resolution, weighted noise floor | ISO 18738 4.6.3 (0 Hz যাচাই) |
| 10 | **FFT spectrum** + শীর্ষ কম্পাঙ্ক, **roller guide / sheave ঘূর্ণন কম্পাঙ্ক** (f = v/πD) ও মিল, **hoistway-এ বড় bump-এর অবস্থান (m)** | EVA-625 ধারণা (spectrum, distance history, roller guide diagnosis) |
| 11 | **Accelerometer-only মোড শক্ত করা**: 10 Hz সংকেতের integration, drift সূচক ও আনুমানিক height-ভুল সতর্কতা, জানা উচ্চতায় scale | আপনার অনুরোধ (বেশিরভাগ ফোনে barometer নেই) |
| 12 | Stop-বোতাম ছোঁয়ার ঝাঁকুনি এড়াতে রেকর্ডিংয়ের শেষ ০.৫ s বাদ | ফোন হাতে ছোঁয়া ধরা পড়ে |

---

## ১. এই প্যাকেজে কী আছে

| ফাইল/ফোল্ডার | কী |
|---|---|
| `www/` | অ্যাপ (HTML/CSS/JS): স্ক্রিন, signal processing (`core.js`), chart, PDF |
| `native/` | Java plugin: দ্রুত accelerometer (200 Hz পর্যন্ত) ও barometer |
| `.github/workflows/build-apk.yml` | GitHub-এ APK বানানোর workflow (v1-এর মতোই, বদলায়নি) |
| `scripts/` | build-এর সহায়ক script |
| `tests/` | স্বয়ংক্রিয় পরীক্ষা: `core.test.js` (signal processing), `e2e.js` (পুরো অ্যাপ) |
| `docs/ANALYSIS-ISO18738-EVA625-বাংলা.md` | দুটি ডকুমেন্টের বিশ্লেষণ ও অ্যাপের সাথে তুলনা |

---

## ২. অ্যাপ কী মাপে (ISO 18738:2003 অনুযায়ী)

| ফলাফল | পদ্ধতি | ISO ধারা |
|---|---|---|
| Max/A95 acceleration, deceleration | z-অক্ষ, 10 Hz low-pass; A95 = max speed-এর 5%→95% অংশে ৯৫ শতাংশ-মান | 5.2 |
| Max jerk | 10 Hz ত্বরণের 0.5 s least-squares ঢাল | 5.3 |
| Max ও V95 speed | 10 Hz ত্বরণের integration; V95 = ৯৫% গতি + 1 s থেকে ৯৫% গতি − 1 s | 5.5 |
| X, Y কম্পন (Max ও A95 pk-pk, mg) | weighted (Wd), B1–B2-এর মধ্যে | 5.4.2 |
| Z কম্পন, constant region (Max ও A95) | weighted (Wk), Annex B | 5.4.3 |
| Z কম্পন, non-constant region (Max) | weighted (Wk), Annex B | 5.4.3 |
| Sound (LAeq, max dB(A)) | **মাপা হয় না** (ফোনের mic Type 2 নয়) | 5.6 |

অতিরিক্ত (ISO 18738-এর অংশ নয়): ISO 2631-1 weighted rms ও আরামের স্কেল, 1/3-অক্টেভ বর্ণালি বনাম **ISO 2631-1 সমান-আরাম রেখা**, FFT, bump অবস্থান, roller guide diagnostics।

### ⚠ গুরুত্বপূর্ণ কথা (সোজাসুজি)
- **ISO 18738 কোনো গ্রহণযোগ্য/অগ্রহণযোগ্য সীমা বা "comparison curve" দেয় না** (Scope: "does not specify acceptable or unacceptable ride quality")। তাই অ্যাপের সীমাগুলো (acceleration 1.0, jerk 1.5, A95 উল্লম্ব 20 mg, অনুভূমিক 15 mg) **সম্পাদনযোগ্য রেফারেন্স মান**, standard-এর শর্ত নয়। আপনার প্রজেক্ট/গ্রাহকের স্পেসিফিকেশন বসান (আরও → Reference limits)। বর্ণালির সবুজ/কমলা রেখা ISO 2631-1 আরামের রেখা।
- v1-এ আমি "ISO 18738-1 / 8100-34" নাম ও 2 Hz filter ধরেছিলাম। আপনার পাঠানো আসল standard (2003) পড়ে দেখলাম সেটা ঠিক ছিল না; v2 ঠিক করেছে।
- আপনার PDF **2003 সংস্করণ**। পরে এটি ISO 18738-1:2012 হয়ে এখন ISO 8100-34:2021 দ্বারা প্রতিস্থাপিত। নতুন সংস্করণে খুঁটিনাটি বদলাতে পারে; আমি সেগুলো পড়িনি, তাই যাচাই করা নেই।

---

## ২ক. Barometer না থাকলে (Realme 8 ইত্যাদি)

- ISO 18738 নিজেই speed/height বের করে **ত্বরণের integration** দিয়ে (5.5.1) — তাই accelerometer-ই যথেষ্ট; barometer ঐচ্ছিক উন্নতি।
- অ্যাপ ধরে নেয় লিফট শুরুর আগে ও শেষে স্থির ছিল (zero-velocity সংশোধন)। তাই **শুরুতে ৩ সেকেন্ড স্থির, শেষে থামার পর অন্তত ১ সেকেন্ড স্থির** থাকা জরুরি।
- Drift বড় হলে অ্যাপ সতর্ক করে ও আনুমানিক height-ভুল (± m) দেখায়। **জানা ভ্রমণ উচ্চতা** দিলে speed ও height সেই উচ্চতায় scale হয়।
- সিমুলেশনে (barometer ছাড়া, ১২টি এলোমেলো লিফট, ২০–৫২ m, noise বিভিন্ন): height-ভুল সর্বোচ্চ **0.31 m**, গড় **0.08 m**; speed-ভুল সর্বোচ্চ **1.3%**। এটা সিমুলেশন; আসল লিফটে বেশি হতে পারে।

---

## ৩. দ্রুত দেখা (ব্রাউজার demo)

`LiftRideTest-demo.html` Chrome/Edge-এ খুলুন। কাল্পনিক ডেটা দিয়ে **Start → Results → PDF/CSV** সব দেখা যাবে (লেবেল করা: DEMO)। More → Data source থেকে demo গতি বাড়ানো যায়।

---

## ৪. APK বানানো — GitHub-এ ধাপে ধাপে (কম্পিউটারে Android Studio লাগবে না)

### ধাপ ১: repository তৈরি
1. <https://github.com> খুলে লগইন করুন।
2. উপরে ডানে **＋** চিহ্নে ক্লিক → **New repository**।
3. **Repository name** ঘরে লিখুন `lift-ride-meter`।
4. **Private** বেছে নিন (নিজের কাছে রাখতে চাইলে)। → নিচে সবুজ **Create repository**।

### ধাপ ২: ফাইল আপলোড
1. zip ফাইলটি কম্পিউটারে **Extract** করুন।
2. নতুন repository-র পাতায় **uploading an existing file** লিংকে ক্লিক করুন (না দেখলে: **Add file → Upload files**)।
3. extract করা ফোল্ডারের **ভেতরের সব ফাইল ও ফোল্ডার** (`www`, `native`, `scripts`, `tests`, `package.json`, `capacitor.config.json`, `README.md` …) সিলেক্ট করে পাতায় **ড্র্যাগ করে ছাড়ুন**।
    - ⚠ ফোল্ডারের **ভেতরের** জিনিস আপলোড করুন, বাইরের ফোল্ডারটি নয়। নাহলে GitHub-এ `www` একটি সাব-ফোল্ডারের ভেতরে চলে যাবে ও build ব্যর্থ হবে।
4. লুকানো (dot) ফাইলগুলো ড্র্যাগে না এলে **হাতে বানান** (পরের ধাপ ৩)।
5. নিচে **Commit changes** চাপুন।

### ধাপ ৩: লুকানো ফাইল হাতে বানানো (দরকার হলে)
**Add file → Create new file** ক্লিক করে:

| নামের ঘরে লিখুন | ভেতরে পেস্ট করুন |
|---|---|
| `.github/workflows/build-apk.yml` (`/` টাইপ করলেই ফোল্ডার হয়ে যায়) | আলাদা পাঠানো `build-apk.yml` ফাইলের পুরো লেখা |
| `.java-version` | শুধু `21` |
| `.gitignore` | `node_modules/` ও `android/` (দুই লাইনে) |

প্রতিটির পর **Commit changes**।

### ধাপ ৪: build চালানো
1. উপরের **Actions** ট্যাবে যান। (প্রথমবার “I understand my workflows, go ahead and enable them” দেখালে সেটি চাপুন।)
2. বাঁ পাশে **Build APK** বেছে নিন → ডানে **Run workflow** → সবুজ **Run workflow** বোতাম।
    - workflow ফাইল আপলোডের সময়ই নিজে থেকে একটি build শুরু হতে পারে; তখন নতুন করে চালাতে হয় না।
3. চলমান রানে ক্লিক করুন। প্রতিটি ধাপের পাশে ✓ আসবে। সাধারণত **৮–১৫ মিনিট** লাগে।
4. শেষ হলে পাতার নিচে **Artifacts** অংশে **`LiftRideTest-debug-apk`** ক্লিক করে নামান।
5. ব্যর্থ হলে ধাপের নামের পাশে লাল ✗ থাকবে। ওই ধাপ খুলে **লাল `Error` লাইন** পড়ুন (প্রতিটি ধাপ নিজে কারণ লিখে দেয়), তারপর নিচের **সমস্যা-সমাধান সারণি** দেখুন।

### ধাপ ৫: ফোনে ইনস্টল
1. নামানো zip ফোনে নিয়ে (Drive/USB/WhatsApp) extract করুন → `LiftRideTest-debug.apk`।
2. APK-তে ট্যাপ করুন। “অজানা উৎস থেকে ইনস্টল”-এর অনুমতি চাইলে **Settings → অনুমতি** দিন।
3. Play Protect সতর্ক করলে **Install anyway / তবুও ইনস্টল করুন**।
4. অ্যাপ খুলুন। **মাপুন** ট্যাবে Sensor অবস্থায় `নেটিভ sensor` ও `✓ Accelerometer` দেখাবে।

---

## ৫. লিফটে কীভাবে মাপবেন (ISO 18738 6.2–6.4)

1. ফোন **কার-ফ্লোরের মাঝামাঝি (১০০ mm-এর মধ্যে) সমতলভাবে** রাখুন, পর্দা উপরে, উপরের দিক দরজার দিকে। ফ্লোরের সাধারণ আচ্ছাদনের ওপরেই রাখুন; নরম জিনিসের ওপর নয়। হাতে ধরবেন না।
2. Measure ট্যাবে Building, Lift ID, From/To floor দিন। “ISO 18738 conditions” খুলে car fan/AC বন্ধ, alarm/chime বন্ধ, phone placement ঠিক কি না টিক দিন (টিক না দিলে রিপোর্টে “Not confirmed” লেখা হয়)।
3. **Start** চাপুন, **দরজা বন্ধ হওয়ার আগেই**, এবং **৩ সেকেন্ড একদম স্থির** থাকুন (বিপ হলে calibration শেষ)।
4. লিফট চালান (টার্মিনাল থেকে টার্মিনাল)। দরজা খোলার পর গাড়ি স্থির হলে **১ সেকেন্ড অপেক্ষা** করে **Stop & analyse** চাপুন।
5. গাড়িতে সর্বোচ্চ দুজন, দুজনেই স্থির ও নিঃশব্দ; ফোনের ১৫০ mm-এর মধ্যে পা নয়।
6. **অন্তত একটি UP ও একটি DOWN** যাত্রা মাপুন। Results-এ দেখাবে কয়টি UP/DOWN সংরক্ষিত।
7. মাপার আগে একবার **More → Run 10 s sensor check** চালিয়ে নিন (ফোন সমতলে স্থির)।

### Results ট্যাবে
- KPI কার্ড; **ISO ride-quality টেবিল** (X, Y, Z-constant, Z-non-constant: Max/A95/0-pk); **Performance টেবিল** (speed, acceleration, deceleration: Max ও A95/V95, jerk); রেফারেন্স সীমার সাথে তুলনা; Diagnostics (FFT শীর্ষ, roller guide মিল, বড় কম্পনের অবস্থান); ১০টি লেখচিত্র।
- **PDF রিপোর্ট** (ইংরেজি, ৪ পাতা, ISO 18738 ধারা 6.5-এর ক্রমে) ও **CSV** (weighted সংকেত ও region চিহ্নসহ)।
- উচ্চতা পরে জানলে “Correct the height and recalculate”।

### Diagnostics ব্যবহার (EVA-র ধারণা)
- More → Analysis settings-এ **roller guide ব্যাস (mm)** ও **sheave ব্যাস (mm)** দিন। অ্যাপ f = v/(π·D) হিসাব করে FFT-তে দাগ দেয়; কাছাকাছি শীর্ষ থাকলে “Possible match” লেখে (অর্থাৎ ওই অংশ সন্দেহজনক; নিশ্চিত রায় নয়)।
- “Largest vibration events”-এ বড় কম্পনের সময় ও start floor থেকে দূরত্ব দেখায় (±০.৫ m মতো), যাতে rail joint খুঁজে পাওয়া যায়।

---

## ৬. আপনার ফোন (Realme 8)

- Realme 8-এ barometer নেই (GSMArena/GSMChoice) → অ্যাপ নিজে শনাক্ত করে accelerometer-only মোডে চলে।
- ফোনের sensor noise-এর কারণে weighted কম্পনের noise floor প্রায় ৫–১০ mg হতে পারে (আপনার ফোনে **Sensor check** চালিয়ে দেখুন)। A95 সীমা ১৫–২০ mg হলে মাপ noise-এর খুব কাছে; অ্যাপ তখন সতর্ক করে।

---

## ৭. নির্ভুলতা ও সীমাবদ্ধতা

**সিমুলেশন পরীক্ষার ফল** (36 m, 2.5 m/s, 1.0 m/s², 1.2 m/s³; ফোন বাঁকা, sensor-এ bias/noise):

| মাপ | ভুল |
|---|---|
| Height (barometer সহ / ছাড়া / উচ্চতা দিয়ে) | ≈ 0.03–0.1 m / 0.07 m / 0.03 m |
| Max speed, V95 | < 1% |
| Max acceleration/deceleration (10 Hz) | ≈ +4–5% (10 Hz-এ কম্পনও ঢোকে; standard-এর নিয়মই এটা) |
| Max jerk | ≈ +4–5% |
| বেশি noise (0.05 m/s²) sensor-এ acceleration | ≈ +10% পর্যন্ত বেশি (noise 10 Hz ব্যান্ডে থাকে) |
| EVA-র মতো FFT: 8 Hz শীর্ষ, roller guide 5.2 Hz | ঠিক ধরা পড়ে |

- ⚠ সবই **কম্পিউটারে সিমুলেশন**। আসল ফোন/লিফটে যাচাই হয়নি।
- ফোনের MEMS sensor ক্যালিব্রেটেড মাপযন্ত্র নয়; ISO 18738 4.6 অনুযায়ী traceable calibration (8 Hz shaker ইত্যাদি) ফোনে সম্ভব নয়। অ্যাপ শুধু **0 Hz (gravity), noise, resolution, rate** যাচাই করে। তাই ফল **screening/তুলনা/ট্রাবলশুটিং**-এর জন্য, সনদ বা চুক্তির বিরোধ মেটানোর জন্য নয়।
- Sound মাপা হয় না।
- কম্পাঙ্ক-সীমা: 200 Hz sampling-এ ≈ 80 Hz, 100 Hz sampling-এ ≈ 40 Hz।

### EVA-625-এর সাথে ফোনের পার্থক্য (সংক্ষেপে)
| | EVA-625 | ফোন |
|---|---|---|
| Sensor | piezoresistive, DC–400 Hz | MEMS, noise বেশি |
| Resolution | 0.6 mg (13-bit, ±1.5 g) | সাধারণত ≥ ২–১০ mg (noise-সহ) |
| Sampling | 256/512 SPS, 80/160 Hz anti-alias | 50–200 Hz, anti-alias অজানা |
| Sound | Type 2, dB(A) | নেই |
| Calibration | traceable | নেই |

---

## ৮. সেটিংস (More ট্যাব)

- **Theme / Data source / DEMO speed**
- **Instrument and report details:** Measured by, Organisation, Instrument ID; **Sensor check**।
- **Reference limits:** acceleration, deceleration, jerk, A95 vertical/horizontal, ISO 2631-1 curve।
- **Analysis settings:** low-pass (ডিফল্ট **10 Hz = ISO**; noisy ফোনে 2–4 Hz দিলে মসৃণ, তবে ISO মান নয়), barometer τ, barometer চালু/বন্ধ, roller/sheave ব্যাস।

---

## ৯. (ঐচ্ছিক) Signed release APK

Debug APK সবসময় কাজ করে। Play Store বা নিজস্ব স্থায়ী signing চাইলে:
1. GitHub repository → **Settings → Secrets and variables → Actions → New repository secret**।
2. চারটি secret যোগ করুন: `KEYSTORE_BASE64` (keystore ফাইলের base64), `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`।
3. আবার **Run workflow** চালান → Artifacts-এ `LiftRideTest-release-apk` আসবে।
4. signing ব্যর্থ হলেও debug APK ঠিকই পাবেন (warning আসবে)।

---

## ১০. পুরোনো সংস্করণ থেকে আপডেট

repo আগে থেকে থাকলে নতুন repo বানাতে হবে না। অংশ **ক১**-এর ধাপগুলো করুন। নতুন ফাইল যোগ হবে আর পুরোনো ফাইল বদলে যাবে। শেষে Actions-এ নতুন build নিজে চলবে।

---

## ১১. সমস্যা-সমাধান সারণি

> ✅ চিহ্ন দেওয়া সারিগুলো **আপনার আসল build ও ফোনে ঘটা** সমস্যা। বাকিগুলো আগাম অনুমান। নতুন লাল Error এলে লাইনটি পাঠান।

| লক্ষণ | সম্ভাব্য কারণ | সমাধান |
|---|---|---|
| ✅ Actions ট্যাবে "Get started with GitHub Actions", কোনো build নেই | `.github` ফোল্ডার আপলোড হয়নি, কারণ ডট-দিয়ে-শুরু লুকানো ফোল্ডার ড্র্যাগ-আপলোডে বাদ পড়ে | **set up a workflow yourself** চাপুন, নাম `build-apk.yml` দিন, লেখা পেস্ট করে Commit |
| ✅ ধাপ ২: `নেই: .java-version` | একই কারণ: লুকানো ফাইল বাদ পড়েছে | **Add file → Create new file**, নাম `.java-version`, ভেতরে `21` |
| ✅ Sensor check "Keep the phone flat…"-এ আটকে থাকে | v2.0.0-এ native `start()` উত্তর না দিলে অপেক্ষা চলতেই থাকত | v2.0.1 থেকে ঠিক: সময়সীমা আছে, ধাপের নাম দেখায়, দরকারে WebView sensor-এ চলে যায় |
| ✅ `www` ফোল্ডারে `config.js` নেই | repo-তে এখনো আগের সংস্করণ আছে, নতুন প্যাকেজ আপলোড হয়নি | অংশ **ক১**: zip-এর ভেতরের সবকিছু repo-র মূল পাতায় **Upload files** দিয়ে তুলুন |
| ✅ পাশাপাশি রাখা দুই ফোনের ফল পুরো মেলে না | রান আলাদা (UP বনাম DOWN, আলাদা সময়)। একটি ফোনে barometer নেই বলে উচ্চতা/গতিতে drift। sensor noise আলাদা। Max p-p একটি স্পাইকেই বদলায় | দুই ফোন একসঙ্গে Start করে একই রান মাপুন। barometer নেই এমন ফোনে আসল Travel height বসান। তুলনা করুন A95 মান দিয়ে, Max দিয়ে নয় |
| ✅ Vibration গ্রাফের শুরুতে বড় spike (±250 mg), বাকি গ্রাফ চ্যাপ্টা | Start চাপার ঝাঁকুনি বা ফোনের প্রথম কয়েকটি sample ফিল্টারের মাধ্যমে still window-তে ছড়িয়ে পড়ত। এতে noise floor-ও বেশি দেখাত | v2.1.1 থেকে ঠিক: প্রথম 0.5 s ফিল্টারের আগে স্থির মানে রাখা হয় |
| ✅ GitHub-এ ফাইলের লেখা মোছা যায় না | ফাইল দেখার পাতা (`/blob/`), সম্পাদনার পাতা নয় | ✏ পেন্সিল চাপুন, অথবা **Add file → Upload files** দিয়ে একই নামের ফাইল দিন |
| Cloud: "The URL did not return data… /exec… Anyone" | Web app-এর অ্যাক্সেস "Anyone" নয়, বা URL `/dev` বা ভুল | Deploy → Manage deployments → ✏ → Who has access: **Anyone**; URL `/exec` দিয়ে শেষ |
| Cloud: "Backend not set up: run setup()" | setup চালানো হয়নি | Apps Script-এ **setup → Run** |
| setup: "Edit ADMIN_USER / ADMIN_PASS…" | নমুনা পাসওয়ার্ড বদলানো হয়নি | ওপরের তিনটি লাইন বদলে আবার Run |
| Cloud: "No connection to the server" | ইন্টারনেট নেই, বা URL ভুল টাইপ | নেট দেখুন। `config.js`-এর URL ব্রাউজারে খুলে `{"ok":true}` আসে কি না দেখুন |
| অনুরোধের ইমেইল আসে না | Gmail-এর দৈনিক সীমা, বা Spam ফোল্ডার, বা setup-এ Allow দেওয়া হয়নি | Spam দেখুন। Admin ট্যাবে অনুরোধ তবুও দেখা যায়। setup আবার Run করে Allow দিন |
| "Please sign in again" | Token-এর ৩০ দিন শেষ, বা admin অ্যাকাউন্ট বন্ধ করেছে | আবার sign in করুন। বন্ধ হলে admin-কে বলুন |
| "A request with this ID is already waiting" | আগেই অনুরোধ পাঠানো হয়েছে | Admin-এর অনুমোদনের অপেক্ষা করুন |
| Pages: 404 বা workflow-এ "Get Pages site failed" | Pages চালু নয়, অথবা repo private | Settings → Pages → Source: **GitHub Actions**; Free প্ল্যানে repo public, নাহলে Netlify Drop |
| PC-তে Install বোতাম আসে না | `http://` ঠিকানা বা ফাইল থেকে খোলা হয়েছে | শুধু `https://` (Pages বা Netlify) ঠিকানায় Install আসে |
| PWA-তে নতুন সংস্করণ আসে না | পুরনো ফাইল cache-এ আছে | অ্যাপ একবার বন্ধ করে আবার খুলুন, অথবা Ctrl+Shift+R |
| Actions-এ **Build APK** দেখা যায় না | workflow ফাইল ভুল জায়গায় | ফাইলের পথ ঠিক `.github/workflows/build-apk.yml` কি না দেখুন (ধাপ ৩) |
| ধাপ ২: `নেই: www/index.html` | ফোল্ডারের **ভেতরের** জিনিসের বদলে বাইরের ফোল্ডার আপলোড হয়েছে | repository-র মূল পাতায় `www`, `native` সরাসরি থাকতে হবে; ভুল হলে ফাইলগুলো মুছে ঠিকভাবে আবার আপলোড করুন |
| ধাপ ২: `নেই: .java-version` | dot-ফাইল আপলোড হয়নি | ধাপ ৩ অনুযায়ী হাতে বানান |
| ধাপ ৩/৪: Node/Java সংস্করণ ত্রুটি | `package.json`-এর `engines` বা `.java-version` বদলে গেছে | `engines.node` = `22.x`, `.java-version` = `21` (Capacitor 8-এর প্রয়োজন) |
| ধাপ ৫: `E404`/`ETARGET`/`ERESOLVE` (`@capacitor/...`) | কোনো প্যাকেজের ঘোষিত সংস্করণ নেই | `package.json`-এ চারটি `@capacitor/*` সংস্করণ একই major (`^8.0.0`) রাখুন; না মিললে `^8` বদলে `latest` লিখে চেষ্টা করুন |
| ধাপ ৬: `cap add android` ব্যর্থ | Node পুরনো, বা প্যাকেজ অসম্পূর্ণ | ধাপ ৫-এর লগ দেখুন; Node 22+ লাগে |
| ধাপ ৭: `native/... নেই` বা `registerPlugin নেই` | `native/` ফোল্ডার আপলোড হয়নি | `native` ফোল্ডারে দুটি `.java` ফাইল আছে কি না দেখুন |
| ধাপ ৯-এ `platforms/android-NN নেই` সতর্কতা | runner-এ ওই platform নেই | script নিজে `sdkmanager` দিয়ে ইনস্টলের চেষ্টা করে; তবু ব্যর্থ হলে লগ পাঠান |
| ধাপ ১০: `SDK location not found` | SDK পথ পাওয়া যায়নি | ধাপ ৯-এর লগে SDK ফোল্ডার ছাপা আছে কি না দেখুন; `android/local.properties` তৈরি হয় |
| ধাপ ১০: `invalid source release: 21` | Gradle পুরনো Java-য় চলছে | `.java-version` = `21` ও ধাপ ৪ সফল কি না দেখুন |
| ধাপ ১০: `Minimum supported Gradle version` | Capacitor ও Gradle মিলছে না | `android` ফোল্ডার আপলোড করে থাকলে মুছে দিন (ঠিক করে নিজে বানায়) |
| ধাপ ১০: Java compile error `LiftSensorPlugin` | plugin কোড ও Capacitor সংস্করণের অমিল | পুরো লাল লাইন পাঠান; সাধারণত এক লাইনের ঠিক |
| APK ইনস্টল হয় না / ব্লক | অজানা উৎসের অনুমতি, Play Protect | Settings-এ অনুমতি দিন; “Install anyway” |
| অ্যাপে `LiftSensor plugin not found` | ধাপ ৭ ব্যর্থ/ছাড়া পড়েছে | ধাপ ৭ সবুজ কি না দেখুন; আবার Run workflow |
| অ্যাপ খুলে সাদা পর্দা | `www` ফাইল অসম্পূর্ণ | `www/index.html`, `www/js/`, `www/css/` সব আছে কি না দেখুন |
| `– Barometer (not needed)` | ফোনে barometer নেই (Realme 8-এ স্বাভাবিক) | accelerometer-only মোড; জানা উচ্চতা দিন |
| Sample rate 50 Hz-এর নিচে | ব্যাটারি সেভার/পাওয়ার-সেভিং | সেভার বন্ধ করুন; অ্যাপকে “Unrestricted battery” দিন |
| “No lift motion was detected” | ফোন লিফটের সাথে নড়েনি বা ত্বরণ খুব কম | ফোন মেঝেতে সমতলে রাখুন; আবার মাপুন |
| “The phone was not still during the first 3 seconds” | calibration-এর সময় নড়াচড়া | ৩ সেকেন্ড একদম স্থির থাকুন |
| Height ভুল (অনেক কম/বেশি) | থামার পর অপেক্ষা কম, বা ফোন নড়েছে | থামার পর ২ সেকেন্ড অপেক্ষা; জানা উচ্চতা দিয়ে “আবার হিসাব” |
| PDF/CSV-এর শেয়ার মেনু আসে না | Share/Filesystem plugin নেই | ধাপ ৫ (npm install) সফল কি না দেখুন; ব্রাউজার-demo-তে সরাসরি ডাউনলোড হয় |

---
| “Large sensor offset drift …” | ফোনের offset/ঝোঁক যাত্রার সময় বদলেছে বা শেষে ভালো স্থির ছিল না | ফোন ফ্লোরে শক্ত করে রাখুন; থামার পর ১–২ s স্থির; জানা উচ্চতা দিয়ে “Recalculate” |
| “Vertical vibration is close to the phone sensor noise” | মাপা কম্পন ফোনের noise floor-এর কাছাকাছি | More → Sensor check চালান; মান শুধু ইঙ্গিত; ক্যালিব্রেটেড যন্ত্রে মিলিয়ে নিন |
| Sensor check-এ ⚠ Sampling rate | ফোন 95 Hz-এর কম দিচ্ছে | ব্যাটারি সেভার বন্ধ, অ্যাপে “Unrestricted battery” |
| “Not enough still time after the lift stopped” | থামার পরই Stop চাপা হয়েছে | থামার পর অন্তত ১ s অপেক্ষা (শেষ ০.৫ s বাদ যায়) |
| “No clear constant-acceleration section” | যাত্রা ছোট (≈ ২–৩ m) বা ধীর | লম্বা যাত্রা মাপুন; ছোট যাত্রায় boundary স্বয়ংক্রিয় শিথিল হয় |
| Results-এ “UP 1, DOWN 0 …” | ISO 6.4: দুই দিকই লাগে | উল্টো দিকের যাত্রাও মাপুন (Building + Lift ID একই রাখুন) |
| Roller guide “Possible match” আসে না | ব্যাস ভুল / শীর্ষ দুর্বল | ব্যাস (mm) মিলিয়ে নিন; steady-speed অংশ কম হলে FFT হয় না |

---

## ১২. যা যাচাই করা হয়েছে ও যা হয়নি

**যাচাই হয়েছে (আমার কম্পিউটারে):**

- `tests/core.test.js`: ISO 2631-1 weighting (published dB মানের সাথে), 10 Hz filter (−3 dB at 10 Hz), Annex A (sine → pk-pk = 2A), 0.5 s LSQ ঢাল, boundary 0.5 m, Annex B region, সিমুলেটেড লিফট (barometer সহ/ছাড়া, উপরে/নিচে, noise, ১২টি এলোমেলো লিফট), bump সময়/অবস্থান, roller guide কম্পাঙ্ক, ঝাঁকানো ফোন, লিফট না চললে ত্রুটি, sensor check — সব পাস।
- `tests/e2e.js`: Chromium-এ পুরো অ্যাপ (ইংরেজি UI যাচাই, রেকর্ডিং, ISO টেবিল, ১০টি চার্ট, PDF ৪ পাতা, CSV, UP/DOWN ট্র্যাকিং, sensor check, সীমা বদল, উচ্চতা সংশোধন, light/dark, মোবাইল/ডেস্কটপ screenshot) — সব পাস; PDF-এর পাতাগুলো ছবি করে চোখে দেখা হয়েছে।
- Workflow YAML পার্স হয়েছে (১৫ ধাপ), v1 থেকে অপরিবর্তিত।

- `tests/backend.test.js`: আসল `Code.gs` চালানো হয়েছে Google service-এর অনুকরণে (Sheets, Drive, Mail, Cache)। এতে ৮০টির মতো চেক পাস, যেমন:
    - login, ভুল পাসওয়ার্ড ও lock-out।
    - অনুরোধ, অনুমোদন ও প্রত্যাখ্যান, এবং ইমেইল।
    - ভূমিকা (user কেবল নিজের রেকর্ড পায়), জাল বা মেয়াদোত্তীর্ণ token প্রত্যাখ্যান, বন্ধ অ্যাকাউন্ট সাথে সাথে বন্ধ।
    - একই রেকর্ড দুবার না ঢোকা, ভুল ডেটা প্রত্যাখ্যান, gzip ফাইল ফেরত পড়া, মুছা।
- `tests/e2e-cloud.js`: ব্রাউজারে পুরো ক্লাউড প্রবাহ পাস। এর মধ্যে:
    - Request access, pending অবস্থায় login বাধা, admin badge ও Approve।
    - Send এবং অফলাইনে Queued।
    - Admin-এর Open, PDF ও CSV, ইউজার ব্যবস্থাপনা।
    - Reading file export ও import।
    - `config.js` দিয়ে URL লক।
    - PWA-র manifest ও service worker।
    - আসল `fetch` পথ দিয়ে নকল Apps Script URL-এ পরীক্ষা।
- Screenshot দেখা হয়েছে: sign in ও request (মোবাইল dark), Admin (ডেস্কটপ light ও dark, মোবাইল)। `pages.yml` পার্স হয়েছে (৫ ধাপ)।

**যাচাই করা যায়নি:**

- **আসল Google-এ deploy**: Apps Script-এর অনুমতি, Gmail পাঠানো, Drive-এ লেখা, আসল URL-এ CORS বা redirect, আর Google-এর দৈনিক সীমা। প্রথমবার চালিয়ে কোনো ত্রুটি এলে বার্তাটি পাঠান।
- APK-এর WebView থেকে `script.google.com`-এ আসল অনুরোধ।
- GitHub Pages deploy এবং Windows-এ PWA ইনস্টল।
- আসল **Gradle compile ও APK build** (এখানে Android SDK/ইন্টারনেট নেই)। প্রথম build-এ ত্রুটি এলে লাল Error লাইন পাঠান।
- **আসল ফোনের sensor ও আসল লিফট**; ফোনের noise floor আপনার ফোনে Sensor check থেকে জানা যাবে।
- `@capacitor/share`/`filesystem` `^8`-এর উপস্থিতি (npm এখান থেকে ধরা যায়নি)।
- ISO 18738-এর **পরবর্তী সংস্করণ (2012, ISO 8100-34:2021)**-এর পার্থক্য।
- Annex A/B-এর কিছু ব্যাখ্যা: standard-এ B0/B3 দরজা-সংকেতের ওপর ভিত্তি করে (ফোন দরজা দেখতে পায় না); অ্যাপে B0 = calibration-এর পর, B3 = রেকর্ডিংয়ের শেষ। A95 acceleration-এর “প্রথম অর্ধেক” যাত্রার মাঝামাঝি ধরা হয়েছে। এগুলো আমার ব্যাখ্যা।

---

## ১৩. ডেভেলপার তথ্য

- Capacitor 8 (Node 22+, JDK 21, compileSdk/AGP/Gradle প্রজেক্ট নিজে ঠিক করে; workflow-এ SDK/build-tools সংস্করণ হাতে বসানো নেই)।
- পরীক্ষা চালানো: `node tests/core.test.js` (signal processing), `node tests/backend.test.js` (ক্লাউড সার্ভার)।
- ক্লাউড নিয়ম এক জায়গায়: `www/js/cloudlogic.js`। এটা ব্রাউজারের demo সার্ভার ও Apps Script দুটোই ব্যবহার করে। `backend/Code.gs` তৈরি হয় `node scripts/build-backend.js` দিয়ে (`cloudlogic.js` + `backend/gas.js`)। `Code.gs` হাতে সম্পাদনা করবেন না।
- ক্লাউড পরীক্ষা: `NODE_PATH=<playwright-এর পথ> node tests/e2e-cloud.js` (সার্ভার চালু থাকতে হবে)। পুরো অ্যাপের পরীক্ষা: `python3 -m http.server 8123 --directory www` চালিয়ে `NODE_PATH=<playwright-এর পথ> node tests/e2e.js`।
- `www/js/core.js` ব্রাউজার ও Node-এ একই কোড; সব হিসাব এখানে।
- `native/LiftSensorPlugin.java` সংকেত পাঠায় `batch` ইভেন্টে: `{t, ax, ay, az, pt, p}`।
- অ্যাপে backend/login নেই; সব ডেটা ফোনেই (IndexedDB)। তাই backend URL-এর সেটিং এখানে প্রযোজ্য নয়।

---

**Design & Developed by Md. Saiful Islam**
