let opener = null;

export function registerPaySheet(fn) {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

export function pickPayMethod(opts) {
  if (typeof opener === "function") return opener(opts);
  return Promise.resolve({ method: "upi" });
}
