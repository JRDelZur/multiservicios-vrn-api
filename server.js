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
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const clienteEmail = session.customer_details.email;
    const monto = session.amount_total / 100;

    // 1. ABRIMOS LA MOCHILA (METADATA) PARA VER QUÉ ARCHIVO ES
    // Si por alguna razón no trae archivo, ponemos uno por defecto 'error.pdf'
    const archivoPDF = session.metadata.archivo_destino || 'error.pdf';

    // Construimos el enlace dinámico
    const enlaceDescarga = `https://multiserviciosvrn.jrplanet.space/descargas/${archivoPDF}`;

    console.log(`💰 Pago de: ${clienteEmail}. Archivo a enviar: ${archivoPDF}`);

    try {
      await resend.emails.send({
        from: 'Tienda VRN <ventas@jrplanet.space>', // O tu correo de onboarding si aún no verificas
        to: [clienteEmail],
        subject: '¡Aquí tienes tu descarga! - Multiservicios VRN',
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h1 style="color: #4CAF50;">¡Gracias por tu compra!</h1>
            <p>Hemos confirmado tu pago.</p>
            <p>Aquí tienes el archivo que compraste:</p>
            
            <a href="${enlaceDescarga}" 
               style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
               DESCARGAR ARCHIVO
            </a>
            
            <p style="margin-top:20px; color:#777; font-size:12px">
               Enlace directo: ${enlaceDescarga}
            </p>
          </div>
        `
      });
    } catch (error) {
      console.error('❌ Error enviando correo:', error);
    }
  }

  res.json({ received: true });
});


// ... (Tus middlewares y ruta de contacto siguen igual) ...


// --- RUTA 3: CREAR PAGO (Actualizada para llenar la mochila) ---
app.post('/crear-sesion-pago', async (req, res) => {
  try {
    // 2. RECIBIMOS EL ARCHIVO DEL FRONTEND
    const { nombre, precio, archivo } = req.body;

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

      // 3. AQUÍ GUARDAMOS EL DATO EN LA "MOCHILA" DE STRIPE
      metadata: {
        archivo_destino: archivo // "contrato.pdf"
      },

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