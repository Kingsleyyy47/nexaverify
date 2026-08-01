// Shared FAQ content — used on the homepage preview and the full /faq page.
export const FAQ_CATEGORIES = [
  {
    title: "Getting started",
    items: [
      {
        q: "What is NexaVerify?",
        a: "NexaVerify lets you rent real phone numbers on demand to receive SMS verification codes for services like WhatsApp, Telegram, and other platforms that require phone verification. You add funds to your wallet, buy a number for the service you need, and the code shows up in your dashboard.",
      },
      {
        q: "How do I add money to my wallet?",
        a: "Wallet funding is handled directly for now — reach out after signing up and it'll be added to your account. We're working on self-serve payment options.",
      },
      {
        q: "How fast do I receive the verification code?",
        a: "Codes usually arrive within seconds of the service sending them. NexaVerify checks for new messages continuously and receives them the moment they come in, so you don't need to keep refreshing.",
      },
    ],
  },
  {
    title: "Buying numbers",
    items: [
      {
        q: "What happens if I don't receive a code?",
        a: "If a number doesn't receive a code while it's still marked \"waiting,\" you can cancel the rental and the amount is refunded straight back to your wallet balance. Once a code has been delivered, the rental can no longer be cancelled.",
      },
      {
        q: "Can I get more than one code on the same number?",
        a: "Yes, for services that support it. Use \"Request another code\" on a number you've already received a message on — this works on both short-term and long-term rentals, as long as the number is still available in our system.",
      },
      {
        q: "Which services can I buy numbers for?",
        a: "The list depends on what's currently enabled — check the Buy a Number page for the live list. New services get added regularly.",
      },
    ],
  },
  {
    title: "Long-term numbers & auto-renew",
    items: [
      {
        q: "What's the difference between a short-term and long-term number?",
        a: "A short-term rental holds a number for 5-15 minutes — enough time to receive one verification code. A long-term rental keeps the same number reserved for you for a chosen period (a day, a week, a month), so you can keep using it for the same account over time.",
      },
      {
        q: "What happens if I turn on auto-renew?",
        a: "Auto-renew keeps a long-term number active by automatically renewing it before it expires. If you enable it, your wallet is charged the renewal fee each time it renews — you'll see a confirmation with this explained before it's turned on, and it's your responsibility to keep enough balance in your wallet to cover renewals. If your balance runs out, auto-renew is switched off automatically and the number will expire at the end of its current paid period rather than continuing to attempt charges.",
      },
      {
        q: "Can I turn auto-renew off at any time?",
        a: "Yes — toggle it off from the number's card on the My Numbers page at any time. It'll stop renewing at the end of the period you've already paid for.",
      },
    ],
  },
  {
    title: "Account & security",
    items: [
      {
        q: "Is a rented number private to me?",
        a: "While a rental is active, only you can see the codes sent to it through your NexaVerify account. Numbers are recycled after a rental ends, so don't rely on a number remaining tied to a specific account indefinitely once it's released.",
      },
      {
        q: "How do I contact support?",
        a: "Reach out through the contact details on your account page and we'll get back to you as soon as possible.",
      },
    ],
  },
];

// Flat list, used for the homepage's shorter FAQ preview.
export const FAQ_PREVIEW = [
  FAQ_CATEGORIES[0].items[0],
  FAQ_CATEGORIES[1].items[0],
  FAQ_CATEGORIES[2].items[1],
  FAQ_CATEGORIES[3].items[0],
];
