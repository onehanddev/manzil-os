const _base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://manzilos.vercel.app").replace(/\/$/, "");
const APP_URL = _base.endsWith("/app") ? _base : `${_base}/app`;

export default function Page() {
  return (
    <div className="min-h-screen bg-[#F7F5EF] text-[#17201E] selection:bg-[#176B63] selection:text-white">
      <div className="h-[3px] w-full bg-[#176B63]" aria-hidden />

      <header className="sticky top-0 z-20 border-b border-[#DDE2DD]/80 bg-[#F7F5EF]/80 backdrop-blur-[10px]">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-[9px] bg-[#17201E] text-[11px] font-bold tracking-[0.08em] text-white">
              من
            </div>
            <div className="leading-none">
              <div className="text-[14px] font-semibold tracking-[-0.02em]">Manzil OS</div>
              <div className="text-[11px] font-medium tracking-wide text-[#65716D]">
                SOCIETY CASHBOOK
              </div>
            </div>
          </div>

          <a
            href={APP_URL}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#176B63] px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#0E514B] transition-colors"
          >
            Open app <span aria-hidden>→</span>
          </a>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="paper-grain border-b border-[#DDE2DD]">
          <div className="mx-auto max-w-[1120px] px-5 sm:px-6 lg:px-8">
            <div className="grid items-start gap-8 py-10 sm:py-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:py-[60px]">
              <div>
                <h1
                  className="text-[36px] font-normal leading-[0.95] tracking-[-0.04em] sm:text-[48px] lg:text-[54px]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Your closing cash,
                  <br />
                  <span className="italic">down to the last rupee.</span>
                </h1>

                <p className="mt-4 max-w-[480px] text-[15px] leading-6 text-[#65716D] sm:text-[16px] sm:leading-7">
                  Track what you collected, what you spent, and what&apos;s left — all in one
                  place. No spreadsheets. No confusion.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <a
                    href={APP_URL}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-[#176B63] px-7 text-[14px] font-semibold text-white hover:bg-[#0E514B] transition-colors"
                  >
                    Open Manzil OS →
                  </a>
                  <span className="text-[13px] text-[#65716D]">Works on your phone</span>
                </div>
              </div>

              {/* Ledger visual — simplified */}
              <div className="relative lg:pl-2">
                <div className="overflow-hidden rounded-[20px] border border-[#DDE2DD] bg-white shadow-[0_8px_32px_rgba(23,32,30,0.08)]">
                  <div className="flex items-center justify-between border-b border-[#DDE2DD] bg-[#F7F5EF]/60 px-5 py-3.5">
                    <span className="rounded-md bg-[#17201E] px-2.5 py-1 text-[10px] font-bold tracking-widest text-white">
                      CASHBOOK
                    </span>
                    <span className="text-[12px] font-medium text-[#65716D]">1 — 31 Aug 2026</span>
                  </div>

                  <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-end gap-1 border-b border-[#DDE2DD] px-3 py-4 sm:gap-2 sm:px-5">
                    {[
                      { k: "OPENING", v: "₹2,06,394" },
                      { k: "COLLECTED", v: "₹1,20,200", op: "+" },
                      { k: "SPENT", v: "₹82,300", op: "−" },
                      { k: "CLOSING", v: "₹2,44,294" },
                    ].map((cell, idx) => (
                      <div key={cell.k} className="contents">
                        {idx !== 0 && (
                          <span className="pb-1 text-center text-[14px] font-light text-[#65716D]">
                            {cell.op}
                          </span>
                        )}
                        <div
                          className={
                            cell.k === "CLOSING"
                              ? "rounded-lg bg-[#17201E] px-2.5 py-2 text-white sm:px-3"
                              : "px-1 sm:px-2"
                          }
                        >
                          <div
                            className={`text-[10px] font-semibold tracking-[0.08em] ${cell.k === "CLOSING" ? "text-white/60" : "text-[#65716D]"}`}
                          >
                            {cell.k}
                          </div>
                          <div
                            className={`tabular-nums text-[13px] font-semibold tracking-[-0.02em] sm:text-[14px] ${cell.k === "CLOSING" ? "text-white" : "text-[#17201E]"}`}
                          >
                            {cell.v}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="divide-y divide-[#EFEEE7] text-[13px]">
                    <div className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <div className="font-medium leading-none">A-102 · Maintenance</div>
                        <div className="text-[12px] text-[#65716D]">14 Aug</div>
                      </div>
                      <span className="tabular-nums font-semibold">₹2,000</span>
                    </div>
                    <div className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <div className="font-medium leading-none">A-105 · Advance</div>
                        <div className="text-[12px] text-[#65716D]">18 Aug</div>
                      </div>
                      <span className="tabular-nums font-semibold">₹2,500</span>
                    </div>
                    <div className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <div className="font-medium leading-none">Electricity bill</div>
                        <div className="text-[12px] text-[#65716D]">19 Aug</div>
                      </div>
                      <span className="tabular-nums font-semibold text-[#65716D]">₹18,400</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works — plain language */}
        <section className="border-b border-[#DDE2DD] bg-white">
          <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
            <h2
              className="text-[26px] font-normal leading-[1.05] tracking-[-0.03em] sm:text-[32px]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Three steps. <span className="italic">One clear balance.</span>
            </h2>

            <div className="mt-10 grid gap-6 sm:grid-cols-3 sm:gap-6">
              {[
                {
                  n: "01",
                  title: "Enter opening cash",
                  desc: "How much cash you started the month with.",
                },
                {
                  n: "02",
                  title: "Record what you collect",
                  desc: "Pick a flat, enter the amount. That’s it.",
                },
                {
                  n: "03",
                  title: "Record what you spend",
                  desc: "Add expenses as you pay them. Closing balance updates itself.",
                },
              ].map((s) => (
                <div key={s.n} className="rounded-[16px] border border-[#DDE2DD] bg-[#F7F5EF] p-6">
                  <div className="text-[12px] font-bold tracking-[0.1em] text-[#176B63]">
                    {s.n}
                  </div>
                  <h3 className="mt-2 text-[15px] font-semibold tracking-[-0.02em]">{s.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-5 text-[#65716D]">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-[#F7F5EF]">
          <div className="mx-auto max-w-[1120px] px-5 py-10 sm:px-6 sm:py-14 lg:px-8">
            <div className="relative overflow-hidden rounded-[24px] bg-[#17201E] px-6 py-8 text-white sm:px-10 sm:py-10">
              <div
                aria-hidden
                className="absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage:
                    "radial-gradient(ellipse at 30% 20%, white 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #176B63 0%, transparent 50%)",
                }}
              />
              <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2
                    className="text-[24px] font-normal leading-[1.05] tracking-[-0.03em] sm:text-[30px]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Try Manzil OS.
                  </h2>
                  <p className="mt-2 max-w-[420px] text-[14px] leading-6 text-white/65">
                    Open the app on your phone and start recording. No setup needed.
                  </p>
                </div>
                <a
                  href={APP_URL}
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-white px-7 text-[14px] font-semibold text-[#17201E] hover:bg-[#F7F5EF] transition-colors"
                >
                  Open Manzil OS →
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#DDE2DD] bg-[#F7F5EF]">
        <div className="mx-auto max-w-[1120px] px-5 py-6 text-[12px] text-[#65716D] sm:px-6 lg:px-8">
          <span className="font-medium text-[#17201E]">Manzil OS</span> · Society cashbook
        </div>
      </footer>
    </div>
  );
}
