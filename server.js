// 1. Configuración Inicial
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// IMPORTAMOS LA NUEVA LIBRERÍA (Adiós Nodemailer)
const { Resend } = require('resend');

const app = express();

// 2. Inicializamos Resend
// Usamos tu clave de .env (asegúrate que EMAIL_PASS tenga tu API Key de Resend 're_123...')
const resend = new Resend(process.env.EMAIL_PASS);

// --- RUTA 1: WEBHOOK (La señal de Stripe) ---
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`❌ Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Si el pago fue exitoso
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const clienteEmail = session.customer_details.email;
    const monto = session.amount_total / 100;

    console.log(`💰 Pago recibido de: ${clienteEmail} por $${monto}`);

    // --- ENVIAR CORREO CON LA API (ESTO NO FALLA) ---
    try {
      const data = await resend.emails.send({
        from: 'Tienda VRN <ventas@jrplanet.space>',
        to: [clienteEmail], // Resend exige que esto sea una lista []
        subject: '¡Tu descarga está lista! - Multiservicios VRN',
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h1 style="color: #4CAF50;">¡Gracias por tu compra!</h1>
            <p>Hemos confirmado tu pago de <strong>$${monto} MXN</strong>.</p>
            <p>Descarga tu archivo aquí:</p>
            <a href="https://multiserviciosvrn.jrplanet.space/descargas/01.pdf" 
               style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
               DESCARGAR AHORA
            </a>
          </div>
        `
      });
      console.log('✅ Correo enviado con éxito. ID:', data.id);
    } catch (error) {
      console.error('❌ Error enviando correo:', error);
    }
  }

  res.json({ received: true });
});

// --- MIDDLEWARES ---
app.use(cors());
app.use(express.json());

// --- RUTA 2: CONTACTO (Actualizada también a la API) ---
app.post('/enviar-formulario', async (req, res) => {
  const { nombre, email, mensaje } = req.body;

  try {
    await resend.emails.send({
      from: 'Formulario VRN <onboarding@resend.dev>',
      to: [process.env.EMAIL_TO], // Tu correo personal
      subject: `Nuevo mensaje de: ${nombre}`,
      html: `<p>Nombre: ${nombre}</p><p>Email: ${email}</p><p>${mensaje}</p>`
    });
    res.status(200).json({ message: 'Enviado con éxito' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al enviar' });
  }
});

// --- RUTA 3: CREAR PAGO ---
app.post('/crear-sesion-pago', async (req, res) => {
  try {
    const { nombre, precio } = req.body;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'oxxo'],
      line_items: [{
        price_data: {
          currency: 'mxn',
          product_data: { name: nombre },
          unit_amount: parseInt(precio),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: 'https://multiserviciosvrn.jrplanet.space/pago-exitoso.html',
      cancel_url: 'https://multiserviciosvrn.jrplanet.space/tienda.html',
    });
    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: 'Error stripe' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});