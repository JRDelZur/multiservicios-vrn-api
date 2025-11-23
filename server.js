// 1. Cargar las variables de entorno (tus claves) del archivo .env
require('dotenv').config();

// 2. Importar las herramientas que instalamos
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// 3. Inicializar Express (nuestro servidor)
const app = express();

// 4. Configurar Middlewares (Herramientas de conexión)
app.use(express.json()); // Permite al servidor entender datos en formato JSON
app.use(cors()); // Permite que tu frontend hable con este backend

// 5. Configurar el "Transportador" de email
// Node.js usará esto para conectarse a tu servicio de email.
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST, // El host de tu proveedor (ej. smtp.resend.com)
  port: process.env.EMAIL_PORT, // El puerto (ej. 465)
  secure: true, // Usar SSL/TLS
  auth: {
    user: process.env.EMAIL_USER, // Tu usuario (ej. 'resend')
    pass: process.env.EMAIL_PASS, // Tu contraseña (la API Key)
  },
});

// 6. Crear la "Ruta" del Formulario
// Esta es la URL que tu formulario llamará.
// app.post() significa que estamos esperando recibir datos.
app.post('/enviar-formulario', (req, res) => {
  console.log('Datos recibidos:', req.body); // Muestra los datos en la terminal

  // Sacamos los datos del formulario que nos envió el frontend
  const { nombre, email, mensaje } = req.body;

  // 7. Definir las opciones del correo
  const mailOptions = {
    from: `Formulario Web <onboarding@resend.dev>`, // Puedes poner lo que sea, pero Resend/Sendgrid puede que te pida verificar un dominio.
    to: process.env.EMAIL_TO, // El correo que configuraste en .env
    subject: `Nuevo mensaje de contacto de: ${nombre}`,
    html: `
      <h2>Nuevo Mensaje del Formulario de Contacto</h2>
      <p><strong>Nombre:</strong> ${nombre}</p>
      <p><strong>Email:</strong> ${email}</p>
      <hr>
      <p><strong>Mensaje:</strong></p>
      <p>${mensaje}</p>
    `,
  };

  // 8. Enviar el correo
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error al enviar email:', error);
      // Enviar una respuesta de error al frontend
      res.status(500).json({ message: 'Error al enviar el mensaje.' });
    } else {
      console.log('Email enviado:', info.response);
      // Enviar una respuesta de éxito al frontend
      res.status(200).json({ message: '¡Mensaje enviado con éxito!' });
    }
  });
});
// ---
// RUTA PARA CREAR EL PAGO (El puente con Stripe)
// ---
app.post('/crear-sesion-pago', async (req, res) => {
  try {
    // 1. Recibimos los datos del botón del frontend
    const { nombre, precio } = req.body;

    // 2. Le pedimos a Stripe que cree la sesión
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'oxxo'], // Aceptamos Tarjeta y OXXO
      line_items: [{
        price_data: {
          currency: 'mxn', // Pesos Mexicanos
          product_data: {
            name: nombre, // Ej: "Plantilla Contrato"
          },
          unit_amount: parseInt(precio), // Ej: 19900 (que son $199.00)
        },
        quantity: 1,
      }],
      mode: 'payment',

      // 3. A dónde enviamos al cliente después del pago
      // IMPORTANTE: Si estás usando "Live Server" en VS Code, 
      // tu puerto suele ser 5500 o 5501. Ajusta si es necesario.
      success_url: 'https://multiserviciosvrn.jrplanet.space/pago-exitoso.html', 
cancel_url: 'https://multiserviciosvrn.jrplanet.space/tienda.html',
    });

    // 4. Respondemos al frontend con la URL de pago
    res.json({ url: session.url });

  } catch (error) {
    console.error('Error de Stripe:', error);
    res.status(500).json({ error: 'No se pudo iniciar el pago' });
  }
});
// 9. Iniciar el servidor
const PORT = 3000; // El puerto donde correrá el backend
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});