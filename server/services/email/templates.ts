// Plain-text emails for accounts. Kept short; links do the work.

export function verificationEmail(input: { name: string, url: string }) {
  return {
    subject: 'Verify your email for Trimly',
    text: [
      `Hi ${input.name},`,
      '',
      'Confirm your email to finish creating your Trimly account:',
      input.url,
      '',
      'The link works for 1 hour. If you didn\'t sign up, you can ignore this email.'
    ].join('\n')
  }
}

export function passwordResetEmail(input: { name: string, url: string }) {
  return {
    subject: 'Reset your Trimly password',
    text: [
      `Hi ${input.name},`,
      '',
      'Use this link to choose a new password:',
      input.url,
      '',
      'The link works for 1 hour. If you didn\'t ask for this, you can ignore this email; your password stays the same.'
    ].join('\n')
  }
}
