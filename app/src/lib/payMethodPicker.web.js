// In-app chooser so residents always see UPI apps + UPI ID before Razorpay opens.
// Desktop checkout often hides intent apps; this sheet makes the options explicit.

const METHODS = [
  { id: "gpay", label: "Google Pay", hint: "UPI app", method: "upi", app: "google_pay", mark: "G", cls: "gm-pay-gpay" },
  { id: "phonepe", label: "PhonePe", hint: "UPI app", method: "upi", app: "phonepe", mark: "Pe", cls: "gm-pay-phonepe" },
  { id: "paytm", label: "Paytm", hint: "UPI app", method: "upi", app: "paytm", mark: "Pay", cls: "gm-pay-paytm" },
  { id: "vpa", label: "UPI ID / QR", hint: "Enter VPA or scan", method: "upi", mark: "UPI", cls: "gm-pay-vpa" },
  { id: "card", label: "Card / net banking", hint: "Visa, Mastercard, banks", method: "card", mark: "₹", cls: "gm-pay-card" },
];

export function pickPayMethod({ amountPaise, description } = {}) {
  if (typeof document === "undefined") {
    return Promise.resolve({ method: "upi" });
  }

  const rupees = Math.round(Number(amountPaise || 0) / 100);
  const pretty = `₹${rupees.toLocaleString("en-IN")}`;

  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.setAttribute("data-gatemate-pay-picker", "1");
    host.innerHTML = `
      <style>
        .gm-pay-bg{position:fixed;inset:0;background:rgba(12,28,36,.48);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Inter,system-ui,sans-serif}
        .gm-pay-sheet{width:min(420px,100%);background:#fff;border-radius:20px;padding:18px 18px 14px;box-shadow:0 18px 50px rgba(0,0,0,.22)}
        .gm-pay-handle{width:42px;height:4px;border-radius:99px;background:#D6DEE3;margin:0 auto 14px}
        .gm-pay-kicker{margin:0;color:#6B7B85;font-size:12px;font-weight:600}
        .gm-pay-title{margin:4px 0 2px;color:#1B2B33;font-size:20px;font-weight:800}
        .gm-pay-sub{margin:0 0 14px;color:#5A6B74;font-size:13px;line-height:1.4}
        .gm-pay-row{width:100%;display:flex;align-items:center;gap:12px;border:1px solid #E6EEF2;background:#F7FAFB;border-radius:12px;padding:12px 14px;margin:0 0 8px;cursor:pointer;text-align:left}
        .gm-pay-row:hover{border-color:#0B6E8F;background:#EAF4F7}
        .gm-pay-dot{width:36px;height:36px;border-radius:10px;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0}
        .gm-pay-gpay{background:#1A73E8}
        .gm-pay-phonepe{background:#5F259F}
        .gm-pay-paytm{background:#00BAF2}
        .gm-pay-vpa{background:#0B6E8F}
        .gm-pay-card{background:#1C2B33}
        .gm-pay-name{display:block;color:#1B2B33;font-size:14px;font-weight:700}
        .gm-pay-hint{display:block;color:#6B7B85;font-size:12px;margin-top:2px}
        .gm-pay-cancel{width:100%;margin-top:6px;border:0;background:transparent;color:#6B7B85;font-size:14px;font-weight:700;padding:12px;cursor:pointer}
      </style>
      <div class="gm-pay-bg" role="dialog" aria-modal="true" aria-label="Choose payment method">
        <div class="gm-pay-sheet">
          <div class="gm-pay-handle"></div>
          <p class="gm-pay-kicker">Razorpay · ${pretty}</p>
          <h2 class="gm-pay-title">Pay via UPI</h2>
          <p class="gm-pay-sub">${description || "Google Pay, PhonePe, Paytm or a UPI ID. Card and net banking stay available."}</p>
          <div class="gm-pay-list"></div>
          <button type="button" class="gm-pay-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(host);

    const finish = (value) => {
      host.remove();
      document.querySelectorAll("[data-gatemate-pay-picker]").forEach((n) => n.remove());
      resolve(value);
    };

    const list = host.querySelector(".gm-pay-list");
    METHODS.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gm-pay-row";
      const initials = m.mark;
      btn.innerHTML = `<span class="gm-pay-dot ${m.cls}">${initials}</span><span><span class="gm-pay-name">${m.label}</span><span class="gm-pay-hint">${m.hint}</span></span>`;
      btn.addEventListener("click", () => finish({ method: m.method, app: m.app }));
      list.appendChild(btn);
    });

    host.querySelector(".gm-pay-cancel").addEventListener("click", () => finish(null));
    host.querySelector(".gm-pay-bg").addEventListener("click", (e) => {
      if (e.target.classList.contains("gm-pay-bg")) finish(null);
    });
  });
}
