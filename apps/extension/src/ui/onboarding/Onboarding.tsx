import { PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL, TERMS_VERSION } from "@handsift/shared";
import { useEffect, useState } from "react";
import type { SettingsStore } from "../../adapters/storage/settings";
import logoUrl from "../../assets/logo.svg";
import { hasConsented } from "../../core/consent";
import { ETSY_NOTICE } from "../legal";

export interface OnboardingProps {
  settings: SettingsStore;
}

type Status = "loading" | "pending" | "saving" | "failed" | "accepted";

/** First-run page: what HandSift does and sends; HandSift stays idle until the user agrees. */
export function Onboarding({ settings }: OnboardingProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    void settings.get().then((s) => {
      setStatus(hasConsented(s) ? "accepted" : "pending");
    });
    return settings.onChange((s) => {
      if (hasConsented(s)) setStatus("accepted");
    });
  }, [settings]);

  const accept = () => {
    setStatus("saving");
    void settings.update({ termsAcceptedVersion: TERMS_VERSION }).then((s) => {
      setStatus(hasConsented(s) ? "accepted" : "failed");
    });
  };

  return (
    <main className="onboarding">
      <img className="onboarding__logo" src={logoUrl} alt="" width={56} height={56} />
      <h1>Welcome to HandSift</h1>
      <p className="onboarding__lede">
        HandSift labels AI-generated listings on Etsy search and shop pages, and tells you why.
      </p>

      <section aria-labelledby="what-it-does">
        <h2 id="what-it-does">What it does</h2>
        <ul>
          <li>
            <strong>AI · disclosed</strong> when the seller says AI was used. That's the seller's
            own statement.
          </li>
          <li>
            <strong>Likely AI</strong> when other clues add up. That's HandSift's estimate, and it
            can be wrong.
          </li>
          <li>
            Choose to label, blur, or hide flagged listings, and how cautious to be, from the
            HandSift button in your toolbar.
          </li>
        </ul>
      </section>

      <section aria-labelledby="what-is-sent">
        <h2 id="what-is-sent">What it sends</h2>
        <p>
          To check a page, HandSift sends the <strong>ID numbers of the listings on it</strong> to
          the HandSift server, which looks them up through Etsy's official API. It never sends your
          name, your Etsy account, your searches, or anything about other websites. Your IP address
          is used briefly to prevent abuse and is never stored.
        </p>
      </section>

      {status === "accepted" ? (
        <section className="onboarding__done" role="status">
          <h2>You're all set</h2>
          <p>
            HandSift is now checking listings. Open an Etsy search or shop page to see it work; Etsy
            tabs that are already open start on their own.
          </p>
        </section>
      ) : (
        <section className="onboarding__consent" aria-label="Accept the terms">
          <label className="onboarding__agree">
            <input
              type="checkbox"
              checked={agreed}
              disabled={status === "loading"}
              onChange={(e) => {
                setAgreed(e.target.checked);
              }}
            />
            <span>
              I agree to the{" "}
              <a href={TERMS_URL} target="_blank" rel="noreferrer">
                Terms of Use
              </a>{" "}
              and{" "}
              <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
                Privacy Policy
              </a>
              .
            </span>
          </label>
          <button
            type="button"
            disabled={!agreed || status === "loading" || status === "saving"}
            onClick={accept}
          >
            Start using HandSift
          </button>
          <p className="onboarding__hint">
            {status === "failed"
              ? "Couldn't save your choice. Please try again."
              : "HandSift makes no requests until you agree."}
          </p>
        </section>
      )}

      <footer className="onboarding__footer">
        <p>
          Questions or problems? <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
        <p>{ETSY_NOTICE}</p>
      </footer>
    </main>
  );
}
