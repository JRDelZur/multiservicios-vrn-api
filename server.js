require('dotenv').config();
const express = require('express');
const cors = require('cors'); // Importamos cors
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');

const app = express();

// --- CORRECCIÓN CRÍTICA: CORS VA AQUÍ, AL PRINCIPIO ---
// Esto le dice al navegador: "Acepto peticiones de cualquier sitio"
app.use(cors());

// Inicializamos Resend
const resend = new Resend(process.env.EMAIL_PASS);

// --- RUTA 1: WEBHOOK ---
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`❌ Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const clienteEmail = session.customer_details.email;
    const monto = session.amount_total / 100;

    // Leemos el archivo de la mochila (metadata)
    const archivoPDF = session.metadata.archivo_destino || 'error.pdf';
    const enlaceDescarga = `https://multiserviciosvrn.jrplanet.space/descargas/${archivoPDF}`;

    console.log(`💰 Pago recibido de: ${clienteEmail}. Archivo: ${archivoPDF}`);

    try {
      await resend.emails.send({
        from: 'Tienda VRN <ventas@jrplanet.space>', // O tu correo verificado
        to: [clienteEmail],
        subject: '¡Aquí tienes tu descarga! - Multiservicios VRN',
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h1 style="color: #4CAF50;">¡Gracias por tu compra!</h1>
            <p>Hemos confirmado tu pago de <strong>$${monto} MXN</strong>.</p>
            <p>Descarga tu archivo aquí:</p>
            <a href="${enlaceDescarga}" 
               style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
               DESCARGAR ARCHIVO
            </a>
          </div>
        `
      });
    } catch (error) {
      console.error('❌ Error enviando correo:', error);
    }
  }

  res.json({ received: true });
});

// Middleware para entender JSON (Va después del webhook, antes de las otras rutas)
app.use(express.json());

// --- RUTA 2: CREAR PAGO ---
app.post('/crear-sesion-pago', async (req, res) => {
  try {
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
      // Guardamos el nombre del archivo para saber cuál enviar luego
      metadata: {
        archivo_destino: archivo
      },
      success_url: 'https://multiserviciosvrn.jrplanet.space/pago-exitoso.html',
      cancel_url: 'https://multiserviciosvrn.jrplanet.space/tienda.html',
    });

    res.json({ url: session.url });

  } catch (error) {
    console.error('Error en Stripe:', error);
    res.status(500).json({ error: 'Error al crear la sesión de pago' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});