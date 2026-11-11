import { PRODUCT_NAME } from '../lib/brand'
import { PLANS, TRIAL_DAYS, formatGbp } from '../lib/plans'

/** All interface text (UK spelling). Language selector stays hidden until a second language exists. */
export const en = {
  brand: PRODUCT_NAME,
  tagline: 'Find where your margin leaks and what each leak costs you.',
  positioning: `Plans from ${formatGbp(PLANS.starter.monthlyGbp)} a month, including VAT. Cancel any time.`,
  trialLine: `Try any plan free for ${TRIAL_DAYS} days. Cancel before your trial ends (date shown at Checkout and in Plan & billing) and pay nothing. Cancel in Plan & billing — one click.`,
  proDataBenefit: 'Keep your data, saved datasets and history while subscribed',
  showTheMaths: 'Show the maths',
  hideTheMaths: 'Hide the maths',
  trueProfit: 'True profit',
  healthScore: 'Health score',
  netMargin: 'Net margin',
  upgradePro: 'View plans',
  free: 'Sample',
  pro: 'Pro',
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
  estimated: 'estimated',
  allocated: 'allocated',
  confidence: 'Confidence',
  orderUsage: (used: number, limit: number) =>
    `${used.toLocaleString('en-GB')} of ${limit.toLocaleString('en-GB')} unique orders this billing month`,
  orderLimitWarn: (nextPlan: string) =>
    `You're at 80% of this month's order allowance. Upgrade to ${nextPlan} to analyse more.`,
  orderLimitBlocked: (
    newUnique: number,
    projected: number,
    limit: number,
    overage: number,
    nextPlan: string,
  ) =>
    `This file would add ${newUnique.toLocaleString('en-GB')} new orders, taking you to ${projected.toLocaleString('en-GB')} of ${limit.toLocaleString('en-GB')} orders this billing month, ${overage.toLocaleString('en-GB')} over your limit. Upgrade to ${nextPlan} to import it. Your existing results are unchanged.`,
  verifyEmail: 'Verify your email before your first upload.',
  googleSignInPendingK6:
    'Google sign-in is not configured in this build. Use email for now.',
  /** K53 — public TikTok copy softened until the XLSX reader ships. */
  tiktokBeta: 'TikTok Shop UK (Beta): Excel import coming soon',
  tiktokBetaBlurb:
    'Excel import for TikTok Shop UK is coming soon. Shopify, Amazon and Etsy uploads work today.',
  platformsLaunchLine: 'Shopify, Amazon and Etsy. TikTok Shop UK (Beta): Excel import coming soon.',
  etsyMultiFileHint:
    'On a phone you can add the Orders, Order Items and Statement files one at a time — it still counts as one upload.',
  inAppBrowserGoogleHint: `If this link opened inside Instagram, Facebook, TikTok or Gmail, use email sign-in here, or open ${PRODUCT_NAME} in Safari or Chrome for Google sign-in.`,
  countryBlocked: `${PRODUCT_NAME} isn't available in your country yet.`,
  alreadySubscribed: 'You already have an active plan',
  paymentProcessing: 'Your payment is processing',
  deletionWarning: (date: string) =>
    `Your data will be deleted on ${date}. Download my data before then.`,
  /** Retired Free 24h messages kept as empty fallbacks for old call sites. */
  freeTryLine: '',
  privacyRetentionLine: 'Original upload files are deleted as soon as they are imported.',
  freeUploadPolicy: '',
  uploadsLeft: (_n: number) => '',
  uploadsExhausted: '',
  tiktokComingSoon: 'TikTok Shop UK (Beta): Excel import coming soon',
  alreadyPro: 'You already have an active plan',
  paymentFailedPastDueDeleted: 'Payment failed — access ended and product data was deleted.',
  paymentFailedClocksResumed: 'Payment failed — access continues until the disclosed end date.',
} as const

export type MessageKey = keyof typeof en
export const messages = { en }
export type Locale = keyof typeof messages
