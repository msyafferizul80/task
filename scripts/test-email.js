
const { Resend } = require('resend')
const dotenv = require('dotenv')
const path = require('path')

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const apiKey = process.env.RESEND_API_KEY

if (!apiKey) {
    console.error('RESEND_API_KEY not found in .env.local')
    process.exit(1)
}

const resend = new Resend(apiKey)

async function sendTestEmail() {
    console.log('Sending test email to sheffi80@gmail.com...')
    try {
        const data = await resend.emails.send({
            from: 'eLeave System <admin@eleave.syazna.com>',
            to: ['sheffi80@gmail.com'],
            subject: 'Test Email from eLeave System',
            html: '<p>This is a test email to verify that the <strong>Resend API</strong> is working correctly.</p>'
        })
        console.log('Email sent successfully:', data)
    } catch (error) {
        console.error('Failed to send email:', error)
    }
}

sendTestEmail()
