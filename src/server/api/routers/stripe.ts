import { env } from "~/env.mjs";
import { getOrCreateStripeCustomerIdForUser } from "~/server/stripe-webhook-handlers";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { z } from "zod";

export const stripeRouter = createTRPCRouter({
  createCheckoutSession: protectedProcedure
    .input(z.object({ billedAnnually: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { stripe, session, prisma, req } = ctx;

      const customerId = await getOrCreateStripeCustomerIdForUser({
        prisma,
        stripe,
        userId: session.user?.id,
      });

      if (!customerId) {
        throw new Error("Could not create customer");
      }

      const baseUrl =
        env.NODE_ENV === "development"
          ? `http://${req.headers.host ?? "localhost:3000"}`
          : `https://${req.headers.host ?? env.NEXTAUTH_URL}`;

      const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        client_reference_id: session.user?.id,
        payment_method_types: ["card"],
        allow_promotion_codes: true,
        mode: "subscription",
        line_items: [
          {
            price: input.billedAnnually
              ? env.STRIPE_ANNUAL_PRICE_ID
              : env.STRIPE_MONTHLY_PRICE_ID,
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/videos?checkoutSuccess=true`,
        cancel_url: `${baseUrl}/videos?checkoutCanceled=true`,
        subscription_data: {
          metadata: {
            userId: session.user?.id,
          },
        },
      });

      if (!checkoutSession) {
        throw new Error("Could not create checkout session");
      }

      return { checkoutUrl: checkoutSession.url };
    }),
  createBillingPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    const { stripe, session, prisma, req } = ctx;

    const customerId = await getOrCreateStripeCustomerIdForUser({
      prisma,
      stripe,
      userId: session.user?.id,
    });

    if (!customerId) {
      throw new Error("Could not create customer");
    }

    const baseUrl =
      env.NODE_ENV === "development"
        ? `http://${req.headers.host ?? "localhost:3000"}`
        : `https://${req.headers.host ?? env.NEXTAUTH_URL}`;

    const stripeBillingPortalSession =
      await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${baseUrl}/videos`,
      });

    if (!stripeBillingPortalSession) {
      throw new Error("Could not create billing portal session");
    }

    return { billingPortalUrl: stripeBillingPortalSession.url };
  }),
});
