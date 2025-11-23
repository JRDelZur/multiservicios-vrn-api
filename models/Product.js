const mongoose = require('mongoose');

// Este es el "Molde" o "Schema"
const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true, // El nombre es obligatorio
  },
  description: {
    type: String,
    required: true,
  },
  priceInCents: {
    type: Number,
    required: true, // El precio es obligatorio
  },
  // La URL segura donde está guardado tu archivo (ej. AWS S3, Google Cloud Storage)
  fileUrl: { 
    type: String,
    required: true,
  },
  // La URL de la imagen de portada
  imageUrl: {
    type: String,
    required: true,
  }
});

// Exportamos el modelo para que 'server.js' pueda usarlo
module.exports = mongoose.model('Product', productSchema);