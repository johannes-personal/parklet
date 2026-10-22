import { Unavailable } from "@/components/unavailable";

/** A booking link the viewer can't open: wrong account, or a wrong link. Cancelled bookings stay viewable. */
export function BookingUnavailable({ email, returnTo }: { email: string; returnTo: string }) {
  return (
    <Unavailable title="Bokningen hittades inte" signedInAs={email} returnTo={returnTo} actions={[{ href: "/mina-sidor", label: "Mina sidor" }]}>
      <p>Bokningen hör till ett annat konto än det du är inloggad med, eller så är länken fel.</p>
      <p>Avbokade bokningar finns kvar under Mina sidor.</p>
    </Unavailable>
  );
}
