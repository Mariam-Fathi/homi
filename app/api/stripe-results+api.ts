import { Stripe } from "stripe";

export async function GET(req: Request) {
  const session_id = new URL(req.url).searchParams.get("session_id");

  if (!session_id) {
    return Response.json(
      { error: "Please provide a valid session_id (`cs_test_...`)" },
      { status: 400 }
    );
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const checkoutSession: Stripe.Checkout.Session =
      await stripe.checkout.sessions.retrieve(session_id, {
        expand: ["line_items", "payment_intent"],
      });

    return Response.json(checkoutSession);
  } catch (error) {
    console.error("Stripe session lookup error:", error);
    return Response.json({ error: "Checkout session not found" }, { status: 404 });
  }
}
