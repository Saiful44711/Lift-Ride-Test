# ISO 18738:2003 ও EVA-625 — বিশ্লেষণ ও অ্যাপের সাথে তুলনা

*Design & Developed by Md. Saiful Islam*

## ক. ISO 18738:2003 (Lifts — Measurement of lift ride quality) — মূল বিষয়

- **পরিধি:** পরিমাপ ও রিপোর্টের পদ্ধতি; **গ্রহণযোগ্য/অগ্রহণযোগ্য মান ঠিক করে না**।
- **যন্ত্র (Table 1):** 3-অক্ষ accelerometer; acceleration channel-এ **10 Hz, 2-pole Butterworth low-pass**; vibration-এ ISO 8041 whole-body weighting; resolution 0.005 m/s² (vibration), 0.01 m/s² (acceleration); range ±1.5 m/s² (গতি-ত্বরণ); sound: A-weighted, Type 2, 1 dB।
- **Boundary (5.1):** B0 = দরজা বন্ধ হওয়ার ≥0.5 s আগে; **B1 = যাত্রা শুরুর 500 mm পরে; B2 = থামার 500 mm আগে**; B3 = দরজা খোলা/থামার ≥0.5 s পরে।
- **Acceleration/deceleration (5.2):** 10 Hz-filtered z; Max এবং **A95** (max speed-এর 5%→95% অংশ)।
- **Jerk (5.3):** 10 Hz ত্বরণের **0.5 s running least-squares ঢাল**; Max।
- **Vibration (5.4):** weighted সংকেত; **peak-to-peak = zero-crossing 1–3, 2–4, 3–5…** (Annex A); **Max** ও **A95**। X,Y: B1–B2। Z: B0–B3, **constant** (Max+A95) ও **non-constant** (Max) region (Annex B: 1 Hz low-pass → 1 s LSQ ঢাল > 0.3 m/s³ → ±0.5 s)।
- **Velocity (5.5):** 10 Hz ত্বরণের **integration**; Max ও **V95** (95% গতি+1 s থেকে 95% গতি−1 s)।
- **Sound (5.6):** B1–B2-এ max ও LAeq।
- **পদ্ধতি (6):** transducer ফ্লোরের কেন্দ্রের **100 mm-এর মধ্যে**, ≥60 kPa চাপে স্থির; সর্বোচ্চ ২ জন, ফোনের 150 mm-এর মধ্যে পা নয়; fan/AC, alarm বন্ধ; **অন্তত একটি UP ও একটি DOWN**।
- **রিপোর্ট (6.5):** তারিখ-সময়, যন্ত্র ID ও শেষ calibration, কারা মাপল/সংস্থা, equipment অবস্থা, building, lift ID, দিক ও তলা; ride-quality ফল; performance ফল; অনিশ্চয়তার চেয়ে বেশি ডিজিট নয়।
- **Calibration (4.6):** 8 Hz-এ ও 0 Hz-এ; national standard-এ traceable।

## খ. EVA-625 (PMT) — মূল বিষয়

- 3-অক্ষ piezoresistive accelerometer, **DC–400 Hz**; 13-bit ADC; **±1.5 g; resolution 0.6 mg**; anti-alias 80/160 Hz; **256/512 SPS**; Type 2 sound (A-weighted fast); ≥700 s ডেটা।
- সফটওয়্যার: ISO ride quality (ISO-weighted), acceleration, speed, jerk, **distance history**, **FFT spectrum** (শীর্ষ কম্পাঙ্ক চিহ্ন), pk-pk / A95 / **0-pk**, sound run/avg/max, project spec-সীমার সাথে তুলনা, রিপোর্ট।
- **Diagnosis:** roller guide (উদাহরণ: 6" roller, 2.5 m/s → ≈5.3 Hz), gear mesh, rail joint “bump” hoistway-এ স্থান নির্ণয়।
- সব হিসাব **unfiltered** ডেটা থেকে; ISO-filtered ডেটা = ride quality।
- Tachometer, escalator, IMD-1 (এ অ্যাপের পরিধির বাইরে)।

## গ. তুলনা: v1 → v2 এবং ফোনে সম্ভাব্যতা

| বিষয় | Standard / EVA | v1 অ্যাপ | v2 অ্যাপ | ফোনে সম্ভব? |
|---|---|---|---|---|
| Accel/jerk filter | 10 Hz 2-pole Butterworth | 2 Hz (ভুল) | 10 Hz (ISO), সেটিংয়ে বদলানো যায় | হ্যাঁ |
| Jerk | 0.5 s LSQ ঢাল | কেন্দ্রীয় পার্থক্য | 0.5 s LSQ ঢাল | হ্যাঁ |
| Vibration পদ্ধতি | weighted + zero-crossing pk-pk | band-pass + ১ s টুকরো | ISO weighted + Annex A | হ্যাঁ (noise সীমা) |
| Max ও A95 | দুটোই | A95 | Max, A95, 0-pk | হ্যাঁ |
| Z-অক্ষ region | constant / non-constant (Annex B) | শুধু steady-speed | Annex B | হ্যাঁ |
| Boundary | B0–B3, B1/B2 = 500 mm | নেই | আছে (integrated height থেকে) | হ্যাঁ |
| Velocity | Max, V95 | শুধু peak | Max, V95 | হ্যাঁ |
| Accel A95 / decel A95 | আছে | নেই | আছে | হ্যাঁ |
| Speed/height | integration | accel + (ঐচ্ছিক baro) | accel-first; baro ঐচ্ছিক; drift সতর্কতা | হ্যাঁ |
| FFT, শীর্ষ কম্পাঙ্ক | EVA | 1/3-octave | + narrow-band FFT | হ্যাঁ |
| Roller guide diagnostics | EVA | নেই | আছে | হ্যাঁ (ব্যাস দিতে হয়) |
| Bump অবস্থান (distance) | EVA | নেই | আছে (±0.5 m) | আংশিক |
| রিপোর্ট ক্ষেত্র (6.5) | বাধ্যতামূলক | সীমিত | সব ক্ষেত্র | হ্যাঁ |
| UP + DOWN | 6.4 | নেই | ট্র্যাক করে | হ্যাঁ |
| 0 Hz যাচাই | 4.6.3 | নেই | Sensor check | হ্যাঁ |
| 8 Hz calibration (shaker) | 4.6.2/4.6.3 | নেই | নেই | না (shaker লাগে) |
| Traceable calibration | 4.6.1 | নেই | নেই | না |
| Sound dB(A) Type 2 | 4.5, 5.6 | নেই | নেই | না |
| Resolution 0.005 m/s² | Table 1 | — | Sensor check-এ পরীক্ষা | ফোন-নির্ভর |

## ঘ. অনুমান-সারণি (এই আপডেটে আমি যা ধরেছি)

| # | অনুমান | কারণ / প্রভাব |
|---|---|---|
| 1 | ফোন ফ্লোরে সমতলে; z = gravity-অক্ষ | v1-এর সিদ্ধান্ত অপরিবর্তিত |
| 2 | B0 = calibration শেষ, B3 = রেকর্ডিং শেষ (−0.5 s) | ফোন দরজার সংকেত জানে না |
| 3 | “প্রথম অর্ধেক” = যাত্রার মাঝামাঝি পর্যন্ত | A95 acc/dec-এর জন্য |
| 4 | zero-phase filter (magnitude হুবহু standard-এর) | peak-এর সময় সরে না; standard causal phase ধরে কি না নিশ্চিত নই |
| 5 | সীমাগুলো রেফারেন্স, standard-এর নয় | standard সীমা দেয় না |
| 6 | Sound বাদ | ফোনের mic Type 2 নয় |
| 7 | সব প্রমাণ সিমুলেশন-ভিত্তিক | আসল লিফট/ফোনে যাচাই হয়নি |
