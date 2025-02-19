// PaystackPop is a global object from paystack.js
declare const PaystackPop: {
  setup: (options: {
    key: string;
    email: string;
    amount: number;
    onClose: () => void;
    callback: (response: { reference: string }) => void;
    ref?: string;
  }) => {
    openIframe: () => void;
  };
};

/** Formats num from kobo to naira. */
export function formatNumber(num: number) {
  num /= 100;
  const formattedNumber = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);

  return formattedNumber;
}

/**Show paystack payment window */
export function payWithPaystack(email: string, amount: number, callback: (response: { reference: string }) => void) {
  const handler = PaystackPop.setup({
    key: import.meta.env.VITE_APP_PAYSTACK_PUBLIC,
    email,
    amount,
    onClose: () => console.log('window closed!'),
    callback
  });
  handler.openIframe();
}

export const phoneNumberRegex = /^(070[1234568]|080[2356789]|081[0-8]|090[1-9]|091[12356])\d{7}$/;