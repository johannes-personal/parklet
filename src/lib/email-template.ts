/**
 * Parklet's e-mail layout: a black header with the wordmark, a white card,
 * one optional call-to-action button and a quiet footer. Table-based with
 * inline styles, which is what Outlook and Gmail reliably render. Every mail
 * also gets a plain-text version.
 */

export type EmailContent = {
  /** Shown by mail clients next to the subject. */
  preheader?: string;
  heading: string;
  /** Paragraphs of plain text; single newlines become line breaks. */
  paragraphs: string[];
  /** Label/value rows, e.g. a booking's time and price. */
  details?: [string, string][];
  button?: { label: string; url: string };
  /** Small print under the card, e.g. why the mail was sent. */
  footnote?: string;
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Escapes text and turns bare links into anchors. */
function rich(s: string) {
  return escape(s)
    .replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#18181b;text-decoration:underline;">${url}</a>`)
    .replace(/\n/g, "<br>");
}

export function renderEmail(c: EmailContent, { appUrl }: { appUrl: string }): { html: string; text: string } {
  const details = c.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px;border-top:1px solid #e4e4e7;">
        ${c.details
          .map(
            ([k, v]) => `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #e4e4e7;font-family:${FONT};font-size:14px;line-height:20px;color:#71717a;width:40%;vertical-align:top;">${escape(k)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #e4e4e7;font-family:${FONT};font-size:14px;line-height:20px;color:#18181b;font-weight:600;vertical-align:top;">${rich(v)}</td>
        </tr>`,
          )
          .join("")}
      </table>`
    : "";
  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px;">
        <tr><td bgcolor="#000000" style="border-radius:8px;background-color:#000000;">
          <a href="${escape(c.button.url)}" style="display:inline-block;padding:14px 22px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${escape(c.button.label)}</a>
        </td></tr>
      </table>
      <p style="margin:12px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:#71717a;">Fungerar inte knappen? Öppna ${rich(c.button.url)}</p>`
    : "";
  const paragraphs = c.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:#3f3f46;">${rich(p)}</p>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<title>${escape(c.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(c.preheader ?? c.paragraphs[0] ?? "")}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#f4f4f5" style="background-color:#f4f4f5;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
      <tr><td bgcolor="#000000" style="background-color:#000000;border-radius:16px 16px 0 0;padding:20px 28px;">
        <a href="${escape(appUrl)}" style="text-decoration:none;"><img src="${escape(appUrl)}/email/logo.png" width="108" height="36" alt="Parklet." style="display:block;border:0;width:108px;height:36px;font-family:${FONT};font-size:24px;font-weight:700;color:#ffffff;"></a>
      </td></tr>
      <tr><td bgcolor="#ffffff" style="background-color:#ffffff;border-radius:0 0 16px 16px;padding:32px 28px 28px;">
        <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:#18181b;">${escape(c.heading)}</h1>
        ${paragraphs}
        ${details}
        ${button}
      </td></tr>
      <tr><td style="padding:20px 28px 0;font-family:${FONT};font-size:12px;line-height:18px;color:#71717a;">
        ${c.footnote ? `${rich(c.footnote)}<br><br>` : ""}Parklet – parkering, delad · <a href="${escape(appUrl)}" style="color:#71717a;">${escape(appUrl.replace(/^https?:\/\//, ""))}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    c.heading,
    "",
    ...c.paragraphs.flatMap((p) => [p, ""]),
    ...(c.details?.length ? [...c.details.map(([k, v]) => `${k}: ${v}`), ""] : []),
    ...(c.button ? [`${c.button.label}: ${c.button.url}`, ""] : []),
    ...(c.footnote ? [c.footnote, ""] : []),
    "Parklet – parkering, delad",
  ].join("\n");

  return { html, text };
}
