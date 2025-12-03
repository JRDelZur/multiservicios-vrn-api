const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const Resend = require('resend'); 

require('dotenv').config();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend.Resend(process.env.RESEND_API_KEY);

const app = express();
const port = process.env.PORT || 4000;

const FRONTEND_DOMAIN = 'https://multiserviciosvrn.jrplanet.space';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

app.use(cors({
  origin: FRONTEND_DOMAIN, 
  methods: 'GET,POST',
}));

app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next(); 
  } else {
    express.json()(req, res, next);
  }
});

app.post('/crear-sesion-pago', async (req, res) => {
  try {
    const { items, nombre, precio, archivo } = req.body;
    let lineItems = [];
    let metadata = {};

    if (items && Array.isArray(items) && items.length > 0) {
      lineItems = items.map(item => ({
        price_data: {
          currency: 'mxn',
          product_data: {
            name: item.nombre,
          },
          unit_amount: item.precio,
        },
        quantity: 1,
      }));

      metadata = {
        tipo: 'carrito',
        archivos: JSON.stringify(items.map(i => i.archivo))
      };

    } else if (nombre && precio) {
      lineItems = [{
        price_data: {
          currency: 'mxn',
          product_data: {
            name: nombre,
          },
          unit_amount: precio,
        },
        quantity: 1,
      }];

      metadata = {
        tipo: 'directo',
        archivo_pdf: archivo
      };
    } else {
      return res.status(400).json({ error: "Datos de producto no válidos o vacíos" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      customer_email: req.body.email,
      success_url: `${FRONTEND_DOMAIN}/exito?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_DOMAIN}/cancelado`,
      metadata: metadata,
    });

    res.json({ url: session.url });

  } catch (error) {
    console.error("Error en Stripe:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error(`❌ Webhook Signature Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details.email;
    const metadata = session.metadata;

    console.log(`✅ Pago Completado. Email: ${customerEmail}`);

    try {
      const deliveryFolder = 'assets/downloads'; 
      let purchasedFileNames = [];

      if (metadata.tipo === 'carrito') {
        purchasedFileNames = JSON.parse(metadata.archivos);
      } else if (metadata.tipo === 'directo') {
        purchasedFileNames.push(metadata.archivo_pdf);
      }

      const listItems = purchasedFileNames.map(filename => {
        const url = `${FRONTEND_DOMAIN}/${deliveryFolder}/${filename}`;
        return `<li><a href="${url}" target="_blank">${filename}</a></li>`;
      });

      const emailContent = `
        <html>
        <body>
            <h1>🎉 ¡Gracias por tu compra en Multiservicios VRN!</h1>
            <p>A continuación, encontrarás los enlaces para descargar tus recursos digitales. 
            Recuerda que tienes hasta 30 días para descargarlos:</p>
            
            <ul style="list-style-type: disc; padding-left: 20px;">
                ${listItems.join('')} 
            </ul>
            
            <p>Si tienes cualquier problema, contáctanos a ventas@jrplanet.space.</p>
        </body>
        </html>
      `;

      await resend.emails.send({
        from: 'Multiservicios VRN <ventas@jrplanet.space>',
        to: customerEmail,
        subject: '🚀 ¡Tus Recursos Digitales de VRN están listos!',
        html: emailContent,
      });

      console.log(`✉️ Correo de entrega enviado a ${customerEmail}`);

    } catch (deliveryError) {
      console.error(`🚨 Error al procesar la entrega o enviar email: ${deliveryError.message}`);
      return res.status(500).json({ error: 'Delivery failed' });
    }
  }

  res.json({ received: true });
});

app.post('/resend-inbound', express.json(), async (req, res) => {
  try {
    const inboundEmailData = req.body;
    const sender = inboundEmailData.from;
    const subject = inboundEmailData.subject || '(Sin Asunto)';
    const toAddress = inboundEmailData.to;
    const bodyText = inboundEmailData.text || ''; 
    const bodyHtml = inboundEmailData.html || '';
    const personalEmailsToForward = [
      'ronnidelgado1102@outlook.com',
      'vncitlali@gmail.com'
    ]; 
    
    const forwardSubject = `📧 REENVÍO: ${subject} (De: ${sender})`;
    let contentToRender = bodyHtml;
    if (!contentToRender && bodyText) {
        contentToRender = bodyText.replace(/\n/g, '<br>');
    } else if (!contentToRender) {
        contentToRender = '<p><i>(El correo recibido no tiene contenido de texto visible)</i></p>';
    }
    
    const forwardHtmlContent = `
        <h2>Correo Reenviado desde ${toAddress}</h2>
        <p><strong>De:</strong> ${sender}</p>
        <p><strong>Asunto:</strong> ${subject}</p>
        <hr style="border: 1px solid #ccc; margin: 20px 0;">
        <div>
            ${contentToRender}
        </div>
    `;
    
    await resend.emails.send({
        from: 'soportevrn@jrplanet.space', 
        to: personalEmailsToForward,
        subject: forwardSubject,
        html: forwardHtmlContent,
    });
    
    console.log(`✉️ Correo entrante de ${sender} reenviado con éxito.`);
    
    res.status(200).send('Correo procesado y reenviado con éxito');
    
  } catch (error) {
    console.error('🚨 Error al procesar correo entrante de Resend:', error.message);
    res.status(200).send('Error controlado en el procesamiento.'); 
  }
});

app.post('/enviar-contacto', async (req, res) => {
  try {
    const { nombre, email, mensaje } = req.body;

    if (!nombre || !email || !mensaje) {
      return res.status(400).json({ error: "Faltan datos obligatorios" });
    }
    await resend.emails.send({
      from: 'Contacto Multiservicios VRN <contactovrn@jrplanet.space>',
      to: ['ronnidelgado1102@outlook.com', 'vncitlali@gmail.com'], 
      subject: `Nueva Consulta Web de: ${nombre}`,
      html: `
        <h1>Nuevo Mensaje desde el Sitio Web</h1>
        <p><strong>Nombre:</strong> ${nombre}</p>
        <p><strong>Email:</strong> ${email}</p>
        <hr />
        <h3>Mensaje:</h3>
        <p>${mensaje}</p>
      `
    });

    res.status(200).json({ success: true, message: "Mensaje enviado correctamente" });

  } catch (error) {
    console.error("Error al enviar contacto:", error);
    res.status(500).json({ error: "Error interno al enviar el correo" });
  }
});

app.listen(port, () => {
  console.log(`Servidor funcionando correctamente en el puerto ${port}`);
});