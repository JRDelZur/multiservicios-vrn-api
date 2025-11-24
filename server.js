// 1. Cargar las variables de entorno
require('dotenv').config();

// 2. Importar herramientas
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// 3. Inicializar Express
const app = express();

// --- CORRECCIÓN: DEFINIMOS EL TRANSPORTER AQUÍ ARRIBA ---
// Así está listo antes de que lo usemos en cualquier ruta
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: 587, //process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  logger: true,
  debug: true,
});

// --- RUTA 1: WEBHOOK DE STRIPE (Debe ir ANTES de express.json) ---
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

    const mailOptions = {
      from: `Tienda VRN <onboarding@resend.dev>`,
      to: clienteEmail,
      subject: '¡Tu descarga está lista! - Multiservicios VRN',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h1 style="color: #4CAF50;">¡Gracias por tu compra!</h1>
            <p>Hemos confirmado tu pago de <strong>$${monto} MXN</strong>.</p>
            <p>Aquí tienes el recurso digital que adquiriste:</p>
            
            <a href="https://multiserviciosvrn.jrplanet.space/descargas/01.pdf" 
               style="background-color: #000; color: #fff; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 10px;">
               DESCARGAR ARCHIVO AHORA
            </a>

            <p style="margin-top: 30px; font-size: 12px; color: #666;">Si tienes problemas con la descarga, responde a este correo.</p>
        </div>
      `,
    };

    // Usamos el transporter que definimos arriba
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('❌ Error enviando correo:', error);
      } else {
        console.log('✅ Correo de producto enviado:', info.response);
      }
    });
  }

  res.json({ received: true });
});

// --- MIDDLEWARES GLOBALES (Para el resto de las rutas) ---
app.use(express.json());
app.use(cors());

// --- RUTA 2: FORMULARIO DE CONTACTO ---
app.post('/enviar-formulario', (req, res) => {
  console.log('Datos recibidos:', req.body);
  const { nombre, email, mensaje } = req.body;

  const mailOptions = {
    from: `Formulario Web <onboarding@resend.dev>`,
    to: process.env.EMAIL_TO,
    subject: `Nuevo mensaje de contacto de: ${nombre}`,
    html: `
      <h2>Nuevo Mensaje</h2>
      <p><strong>Nombre:</strong> ${nombre}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Mensaje:</strong> ${mensaje}</p>
    `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error email:', error);
      res.status(500).json({ message: 'Error al enviar.' });
    } else {
      console.log('Email enviado:', info.response);
      res.status(200).json({ message: 'Enviado con éxito.' });
    }
  });
});

// --- RUTA 3: CREAR PAGO (CHECKOUT) ---
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
    console.error('Error de Stripe:', error);
    res.status(500).json({ error: 'No se pudo iniciar el pago' });
  }
});

// --- INICIAR SERVIDOR ---
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en puerto ${PORT}`);
});