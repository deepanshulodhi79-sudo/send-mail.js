const nodemailer = require('nodemailer');

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Vercel serverless function - har request apna alag process mein chalta hai
module.exports = async (req, res) => {
  // CORS headers (agar frontend kisi aur domain se call kare to)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Sirf POST method allowed hai' });
  }

  const { senderName, senderEmail, appPassword, to, subject, message } = req.body || {};

  if (!senderEmail || !appPassword || !to || !subject || !message) {
    return res.status(400).json({
      success: false,
      error: 'Sender email, app password, receiver, subject aur message sab zaroori hain',
    });
  }

  if (!isValidEmail(senderEmail)) {
    return res.status(400).json({ success: false, error: 'Sender email sahi format mein nahi hai' });
  }

  let recipients = Array.isArray(to)
    ? to
    : String(to)
        .split(/[\n,]+/)
        .map((e) => e.trim())
        .filter(Boolean);

  recipients = [...new Set(recipients)];

  if (recipients.length === 0) {
    return res.status(400).json({ success: false, error: 'Kam se kam ek valid receiver email daalein' });
  }

  const invalidEmails = recipients.filter((e) => !isValidEmail(e));
  if (invalidEmails.length > 0) {
    return res.status(400).json({
      success: false,
      error: `Ye email galat format mein hain: ${invalidEmails.join(', ')}`,
    });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: senderEmail,
      pass: appPassword,
    },
  });

  try {
    await transporter.verify();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Gmail login fail hua. Email/App Password check karein: ' + err.message,
    });
  }

  const fromHeader = senderName ? `"${senderName}" <${senderEmail}>` : senderEmail;

  const results = await Promise.allSettled(
    recipients.map((recipient) =>
      transporter.sendMail({
        from: fromHeader,
        to: recipient,
        subject,
        text: message,
        html: `<p>${message.replace(/\n/g, '<br>')}</p>`,
      })
    )
  );

  const sent = [];
  const failed = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      sent.push(recipients[i]);
    } else {
      failed.push({ email: recipients[i], error: result.reason.message });
    }
  });

  res.status(200).json({
    success: failed.length === 0,
    totalSent: sent.length,
    totalFailed: failed.length,
    sent,
    failed,
  });
};
