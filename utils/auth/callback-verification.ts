export const SIGNUP_CONFIRMATION_DESTINATION = "/signup/thank-you";

export function shouldEstablishSignupVerificationGate(input: {
  destination: string;
  provider: string | null;
}) {
  return input.provider !== "google"
    && input.destination === SIGNUP_CONFIRMATION_DESTINATION;
}
