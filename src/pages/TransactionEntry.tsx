import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import NumPad from "../components/NumPad";
import { db, queueTransaction } from "../lib/db";
import { getDeviceId } from "../lib/device";
import { verifyPin } from "../lib/pin";
import { sync } from "../lib/sync";
import type { Barber, PaymentMethod, Service } from "../types";

type Step = "barber" | "service" | "payment" | "pin" | "done";

const PAYMENT_METHODS: { value: PaymentMethod; label: string; digital: boolean }[] = [
  { value: "cash", label: "Cash", digital: false },
  { value: "momo", label: "MoMo", digital: true },
  { value: "qr", label: "QR", digital: true },
  { value: "card", label: "Card", digital: true }
];

export default function TransactionEntry() {
  const barbers = useLiveQuery(() => db.barbers.toArray(), [], [] as Barber[]);
  const services = useLiveQuery(() => db.services.toArray(), [], [] as Service[]);
  const settings = useLiveQuery(() => db.settings.get("current"), []);

  // Cash only until MoMo is switched on. The digital tiles are hidden rather
  // than removed: turning them on is a database flag and the next sync, with
  // no new build. Defaults to cash-only when settings have not synced yet, so
  // a fresh tablet cannot offer a payment method the shop cannot reconcile.
  const paymentMethods = PAYMENT_METHODS.filter(
    (m) => !m.digital || settings?.momo_enabled === true
  );

  const [step, setStep] = useState<Step>("barber");
  const [barber, setBarber] = useState<Barber | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const reset = () => {
    setStep("barber");
    setBarber(null);
    setService(null);
    setMethod(null);
    setPin("");
    setError(null);
  };

  const confirm = async () => {
    if (!barber || !service || !method) return;
    setChecking(true);
    setError(null);

    const ok = await verifyPin(pin, barber);
    if (!ok) {
      setChecking(false);
      setPin("");
      setError(`That is not ${barber.name.split(" ")[0]}'s PIN`);
      return;
    }

    // Written to IndexedDB before anything touches the network. The sale is
    // durable the moment the PIN is accepted, whatever the connection is doing.
    await queueTransaction({
      id: crypto.randomUUID(),
      barber_id: barber.id,
      service_id: service.id,
      amount: service.price,
      payment_method: method,
      corrects_transaction_id: null,
      created_at_local: new Date().toISOString(),
      device_id: getDeviceId()
    });

    setChecking(false);
    setStep("done");
    void sync();
  };

  if (step === "done") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        <div className="text-center">
          <p className="text-5xl">✓</p>
          <p className="mt-4 text-2xl font-semibold">Sale recorded</p>
          <p className="mt-2 text-gray-400">
            {service?.name} · GHS {service?.price.toFixed(2)} · {method} · {barber?.name}
          </p>
        </div>
        <button type="button" className="btn-primary max-w-sm" onClick={reset}>
          Next customer
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <StepHeader
        step={step}
        barber={barber}
        service={service}
        method={method}
        onBack={() => {
          setError(null);
          if (step === "service") setStep("barber");
          if (step === "payment") setStep("service");
          if (step === "pin") {
            setPin("");
            // Skip the payment step on the way back too, when it was skipped
            // on the way in.
            setStep(paymentMethods.length === 1 ? "service" : "payment");
          }
        }}
      />

      {step === "barber" && (
        <Grid>
          {barbers.map((b) => (
            <button
              key={b.id}
              type="button"
              className="tile"
              onClick={() => {
                setBarber(b);
                setStep("service");
              }}
            >
              {b.name}
            </button>
          ))}
        </Grid>
      )}

      {step === "service" && (
        <Grid>
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              className="tile flex-col gap-1"
              onClick={() => {
                setService(s);
                // With only one payment method there is nothing to choose;
                // making the manager tap "Cash" every time is a tap that
                // teaches them to tap without reading.
                if (paymentMethods.length === 1) {
                  setMethod(paymentMethods[0].value);
                  setStep("pin");
                } else {
                  setStep("payment");
                }
              }}
            >
              <span>{s.name}</span>
              <span className="text-sm text-gray-400">GHS {s.price.toFixed(2)}</span>
            </button>
          ))}
        </Grid>
      )}

      {step === "payment" && (
        <Grid>
          {paymentMethods.map((m) => (
            <button
              key={m.value}
              type="button"
              className="tile"
              onClick={() => {
                setMethod(m.value);
                setStep("pin");
              }}
            >
              {m.label}
            </button>
          ))}
        </Grid>
      )}

      {step === "pin" && barber && (
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-4">
          <p className="text-center text-lg">
            {barber.name}, enter your PIN to confirm
          </p>
          <div className="flex justify-center gap-3">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-4 w-4 rounded-full ${
                  i < pin.length ? "bg-emerald-400" : "bg-gray-700"
                }`}
              />
            ))}
          </div>
          {error && <p className="text-center text-amber-300">{error}</p>}
          <NumPad value={pin} onChange={setPin} />
          <button
            type="button"
            className="btn-primary"
            disabled={pin.length !== 4 || checking}
            onClick={confirm}
          >
            {checking ? "Checking…" : `Confirm GHS ${service?.price.toFixed(2)}`}
          </button>
        </div>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>;
}

function StepHeader({
  step,
  barber,
  service,
  method,
  onBack
}: {
  step: Step;
  barber: Barber | null;
  service: Service | null;
  method: PaymentMethod | null;
  onBack: () => void;
}) {
  const titles: Record<Exclude<Step, "done">, string> = {
    barber: "Who did the cut?",
    service: "What service?",
    payment: "How did they pay?",
    pin: "Confirm with PIN"
  };

  return (
    <div className="flex items-center gap-3">
      {step !== "barber" && (
        <button type="button" className="btn-secondary px-4" onClick={onBack}>
          ←
        </button>
      )}
      <div>
        <h1 className="text-xl font-semibold">{titles[step as Exclude<Step, "done">]}</h1>
        <p className="text-sm text-gray-400">
          {[barber?.name, service?.name, method].filter(Boolean).join(" · ") || "New sale"}
        </p>
      </div>
    </div>
  );
}
