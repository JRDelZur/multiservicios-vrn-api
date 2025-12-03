const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true, 
  },
  description: {
    type: String,
    required: true,
  },
  priceInCents: {
    type: Number,
    required: true, 
  },
  fileUrl: { 
    type: String,
    required: true,
  },
  imageUrl: {
    type: String,
    required: true,
  }
});

module.exports = mongoose.model('Product', productSchema);