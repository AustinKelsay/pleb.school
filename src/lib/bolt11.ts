import { parseBolt11Invoice as snstrParseBolt11Invoice } from "snstr";
import { decode as decodeBolt11 } from "light-bolt11-decoder";

type SnstrParsedBolt11Invoice = ReturnType<typeof snstrParseBolt11Invoice>;

export interface ParsedBolt11Invoice {
  descriptionHash?: string;
  amountMsats?: number;
  paymentHash?: string;
}

export function parseBolt11Invoice(bolt11: string): ParsedBolt11Invoice | null {
  if (typeof bolt11 !== "string" || !bolt11) {
    console.error(
      "parseBolt11Invoice: expected non-empty string invoice, got",
      bolt11,
    );
    return null;
  }

  try {
    const decoded: SnstrParsedBolt11Invoice = snstrParseBolt11Invoice(bolt11);
    if (!decoded || typeof decoded !== "object") {
      return null;
    }

    const result: ParsedBolt11Invoice = {};
    if (decoded.descriptionHash) {
      result.descriptionHash = decoded.descriptionHash.toLowerCase();
    }

    if (decoded.paymentHash) {
      result.paymentHash = decoded.paymentHash.toLowerCase();
    }

    if (decoded.amount != null) {
      const parsedMsats = Number(decoded.amount);
      if (!Number.isNaN(parsedMsats) && parsedMsats >= 0) {
        result.amountMsats = parsedMsats;
      }
    }

    // Some providers return invoices that snstr's helper parses without an
    // amount field. In those cases, fall back to decoding the invoice
    // directly so we can recover the amount from the underlying sections.
    if (result.amountMsats === undefined) {
      try {
        const raw: any = decodeBolt11(bolt11);
        let amountMsats: number | undefined;

        if (raw.millisatoshis != null) {
          const parsedMsats = Number(raw.millisatoshis);
          if (!Number.isNaN(parsedMsats) && parsedMsats >= 0) {
            amountMsats = parsedMsats;
          }
        } else if (raw.satoshis != null) {
          const parsedSats = Number(raw.satoshis);
          if (!Number.isNaN(parsedSats) && parsedSats >= 0) {
            amountMsats = parsedSats * 1000;
          }
        } else if (Array.isArray(raw.sections)) {
          const amountSection = raw.sections.find(
            (section: any) => section?.name === "amount" && section.value != null,
          );
          if (amountSection?.value != null) {
            const parsedMsats = Number(amountSection.value);
            if (!Number.isNaN(parsedMsats) && parsedMsats >= 0) {
              amountMsats = parsedMsats;
            }
          }
        }

        if (Array.isArray(raw.sections)) {
          const paymentHashSection = raw.sections.find(
            (section: any) =>
              section?.name === "payment_hash" && typeof section.value === "string",
          );
          if (!result.paymentHash && paymentHashSection?.value) {
            result.paymentHash = String(paymentHashSection.value).toLowerCase();
          }

          const descriptionHashSection = raw.sections.find(
            (section: any) =>
              section?.name === "description_hash" && typeof section.value === "string",
          );
          if (!result.descriptionHash && descriptionHashSection?.value) {
            result.descriptionHash = String(descriptionHashSection.value).toLowerCase();
          }
        }

        if (typeof amountMsats === "number") {
          result.amountMsats = amountMsats;
        }
      } catch (fallbackError) {
        console.debug(
          "parseBolt11Invoice: fallback decode for amount failed",
          fallbackError,
        );
      }
    }

    if (!result.descriptionHash && result.amountMsats === undefined) {
      return null;
    }

    return result;
  } catch (error) {
    console.error("parseBolt11Invoice: failed to decode invoice via snstr", error);
    return null;
  }
}
