import { describe, expect, it } from "vitest";
import { renderEmail } from "@/lib/email-template";

describe("renderEmail", () => {
  const mail = renderEmail(
    {
      heading: "Ny bokning: <Carport>",
      paragraphs: ["Anna har bokat.\nRad två", "Se https://parklet.example/bokning/1"],
      details: [["Tid", "ons 21 okt 10:00 – 13:00"]],
      button: { label: "Visa bokningen", url: "https://parklet.example/bokning/1?a=1&b=2" },
    },
    { appUrl: "https://parklet.example" },
  );

  it("escapes content and links bare URLs", () => {
    expect(mail.html).toContain("Ny bokning: &lt;Carport&gt;");
    expect(mail.html).not.toContain("<Carport>");
    expect(mail.html).toContain("Rad två");
    expect(mail.html).toContain('<a href="https://parklet.example/bokning/1"');
    expect(mail.html).toContain('href="https://parklet.example/bokning/1?a=1&amp;b=2"');
    expect(mail.html).toContain('src="https://parklet.example/email/logo.png"');
  });

  it("has a plain-text version with the same content", () => {
    expect(mail.text).toContain("Ny bokning: <Carport>");
    expect(mail.text).toContain("Tid: ons 21 okt 10:00 – 13:00");
    expect(mail.text).toContain("Visa bokningen: https://parklet.example/bokning/1?a=1&b=2");
  });
});
