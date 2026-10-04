import { Stripe } from "stripe";

export async function POST(request: Request) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const { name, email, amount } = await request.json();
    const numericAmount = Number(amount);

    if (!name || !email || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return Response.json({ error: "Missing or invalid payment details" }, { status: 400 });
    }

    let customer;
    const doesCustomerExist = await stripe.customers.list({
      email,
    });

    if (doesCustomerExist.data.length > 0) {
      customer = doesCustomerExist.data[0];
    } else {
      customer = await stripe.customers.create({
        name,
        email,
      });
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: "2024-11-20.acacia" }
    );

    const paymentIntent = await stripe.paymentIntents.create({
      // EGP uses 2 decimal places; round to avoid fractional piastres.
      amount: Math.round(numericAmount * 100),
      currency: "egp",
      customer: customer.id,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    return Response.json({
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customer.id,
    });
  } catch (error) {
    console.error("Payment sheet error:", error);
    return Response.json({ error: "Unable to start payment" }, { status: 500 });
  }
}
