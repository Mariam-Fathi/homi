import Stripe from "stripe";

export async function POST(req: Request) {
  try {
    const { email, amount, propertyTitle } = await req.json();
    const numericAmount = Number(amount);

    if (!email || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return Response.json({ error: "Missing or invalid payment details" }, { status: 400 });
    }

    const origin = req.headers.get("origin") ?? new URL(req.url).origin;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      submit_type: "book",
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "egp",
            product_data: {
              name: propertyTitle || "Property booking",
            },
            unit_amount: formatAmountForStripe(numericAmount, "EGP"),
          },
        },
      ],
      success_url: `${origin}/success-payment?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
      ui_mode: "hosted",
    });

    return Response.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Checkout session error:", error);
    return Response.json({ error: "Unable to start checkout" }, { status: 500 });
  }
}

function formatAmountForStripe(amount: number, currency: string): number {
  let numberFormat = new Intl.NumberFormat(["en-US"], {
    style: "currency",
    currency: currency,
    currencyDisplay: "symbol",
  });
  const parts = numberFormat.formatToParts(amount);
  let zeroDecimalCurrency: boolean = true;
  for (let part of parts) {
    if (part.type === "decimal") {
      zeroDecimalCurrency = false;
    }
  }
  return zeroDecimalCurrency ? amount : Math.round(amount * 100);
}
