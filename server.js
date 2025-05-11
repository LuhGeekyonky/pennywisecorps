const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 3600 }); // Cache results for 1 hour

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from public directory

// API key - ideally from env vars, but we include fallback functionality
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';

// Cache middleware
const cacheMiddleware = (req, res, next) => {
  const key = req.originalUrl || req.url;
  const cachedResponse = cache.get(key);
  
  if (cachedResponse) {
    return res.json(cachedResponse);
  }
  
  res.sendResponse = res.json;
  res.json = (body) => {
    cache.set(key, body);
    res.sendResponse(body);
  };
  
  next();
};

// Serve login.html from root directory when accessing base URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'API is running' });
});

// Product search endpoint
app.get('/api/search', cacheMiddleware, async (req, res) => {
  const { type, query, location } = req.query;
  
  if (!type) {
    return res.status(400).json({ error: 'Type parameter is required' });
  }
  
  try {
    let results = [];
    
    // Try to use the RapidAPI product search
    try {
      if (RAPIDAPI_KEY) {
        const searchQuery = buildSearchQuery(type, query);
        
        const options = {
          method: 'GET',
          url: 'https://real-time-product-search.p.rapidapi.com/search',
          params: {
            q: searchQuery,
            country: 'in',
            language: 'en'
          },
          headers: {
            'X-RapidAPI-Key': RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'real-time-product-search.p.rapidapi.com'
          }
        };

        const response = await axios.request(options);
        if (response.data && response.data.data && response.data.data.length > 0) {
          results = processApiResults(response.data.data, type, location);
        } else {
          throw new Error('No results from API');
        }
      } else {
        throw new Error('API key not available');
      }
    } catch (apiError) {
      console.log('API search failed, using fallback:', apiError.message);
      results = generateFallbackResults(type, query, location);
    }
    
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      error: 'Error fetching search results',
      message: error.message
    });
  }
});

// Build search query based on item type and parameters
function buildSearchQuery(type, query) {
  const params = new URLSearchParams(query);
  
  switch(type) {
    case 'mobile':
      const brand = params.get('brand') || '';
      const model = params.get('model') || '';
      const storage = params.get('storage') || '';
      return `${brand} ${model} ${storage} smartphone`.trim();
    
    case 'car':
      return `${params.get('brand') || ''} ${params.get('model') || ''} ${params.get('year') || ''} car`.trim();
    
    case 'two-wheeler':
      return `${params.get('brand') || ''} ${params.get('model') || ''} ${params.get('type') || 'bike'}`.trim();
    
    case 'land':
    case 'apartment':
    case 'house':
    case 'commercial':
      return `${type} for sale ${params.get('area') || ''} sqft`.trim();
      
    case 'clothing':
      return `${params.get('brand') || 'luxury'} ${params.get('type') || ''} clothing`.trim();
    
    case 'electronics':
      return `${params.get('brand') || ''} ${params.get('model') || ''} ${params.get('type') || 'electronics'}`.trim();
    
    case 'watch':
      return `${params.get('brand') || 'luxury'} ${params.get('model') || ''} watch`.trim();
      
    case 'business':
      return `${params.get('type') || ''} business for sale`.trim();
      
    case 'gold':
      return `${params.get('purity') || '22K'} gold ${params.get('type') || 'jewelry'}`.trim();
    
    case 'custom':
      return params.get('query') || 'popular products in india';
      
    default:
      return type;
  }
}

// Process API results into standardized format
function processApiResults(data, type, location) {
  return data.slice(0, 7).map(item => {
    // Extract price - remove all non-numeric characters and convert to number
    let price = 0;
    try {
      if (item.offer && item.offer.price) {
        price = parseInt(item.offer.price.replace(/[^\d]/g, '')) || randomPrice(type);
      } else {
        price = randomPrice(type);
      }
    } catch (e) {
      price = randomPrice(type);
    }
    
    // Extract source from URL
    let source = 'Online Store';
    try {
      if (item.product_page_url) {
        const url = new URL(item.product_page_url);
        source = url.hostname.replace('www.', '');
      }
    } catch (e) {
      // Keep default source
    }
    
    return {
      title: item.product_title || `${type.charAt(0).toUpperCase() + type.slice(1)} Item`,
      price: price,
      details: item.product_description || `Features and specifications for this ${type}`,
      location: location || 'India',
      source: source,
      url: item.product_page_url || `https://www.google.com/search?q=${encodeURIComponent(item.product_title)}`,
      date: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
    };
  });
}

// Fallback function to generate realistic mock results
function generateFallbackResults(type, queryStr, location) {
  const count = Math.floor(Math.random() * 4) + 3; // 3-7 results
  const results = [];
  
  const sources = {
    mobile: ['Flipkart', 'Amazon.in', 'Reliance Digital', 'Croma'],
    'two-wheeler': ['BikeDekho', 'Bikewale', 'OLX', 'Royal Enfield'],
    car: ['CarDekho', 'CarWale', 'OLX Cars', 'Spinny'],
    land: ['99acres', 'MagicBricks', 'Housing.com', 'Makaan.com'],
    apartment: ['99acres', 'MagicBricks', 'Housing.com', 'Nobroker'],
    house: ['99acres', 'MagicBricks', 'Housing.com', 'CommonFloor'],
    business: ['BizQuest India', 'SMERGers', 'BusinessForSale', 'IndiaBizForSale'],
    commercial: ['99acres Commercial', 'MagicBricks Commercial', 'CommercialGuru', 'PropTiger Commercial'],
    gold: ['Tanishq', 'Malabar Gold', 'PC Jeweller', 'Senco Gold'],
    clothing: ['Myntra', 'Ajio', 'Tata CLiQ Luxury', 'Nykaa Fashion'],
    watch: ['Titan', 'Ethos Watches', 'Helios', 'Just Watches'],
    electronics: ['Flipkart', 'Amazon.in', 'Reliance Digital', 'Croma'],
    custom: ['Amazon.in', 'Flipkart', 'Myntra', 'Nykaa']
  };
  
  const sourceUrls = {
    'Flipkart': 'https://www.flipkart.com',
    'Amazon.in': 'https://www.amazon.in',
    'Reliance Digital': 'https://www.reliancedigital.in',
    'Croma': 'https://www.croma.com',
    'BikeDekho': 'https://www.bikedekho.com',
    'Bikewale': 'https://www.bikewale.com',
    'OLX': 'https://www.olx.in',
    'Royal Enfield': 'https://www.royalenfield.com',
    'CarDekho': 'https://www.cardekho.com',
    'CarWale': 'https://www.carwale.com',
    'OLX Cars': 'https://www.olx.in/cars',
    'Spinny': 'https://www.spinny.com',
    '99acres': 'https://www.99acres.com',
    'MagicBricks': 'https://www.magicbricks.com',
    'Housing.com': 'https://www.housing.com',
    'Makaan.com': 'https://www.makaan.com',
    'Nobroker': 'https://www.nobroker.in',
    'CommonFloor': 'https://www.commonfloor.com',
    'BizQuest India': 'https://www.bizquest.com/india',
    'SMERGers': 'https://www.smergers.com',
    'BusinessForSale': 'https://www.businessforsale.in',
    'IndiaBizForSale': 'https://www.india.bizforsale.com',
    '99acres Commercial': 'https://www.99acres.com/commercial-property',
    'MagicBricks Commercial': 'https://www.magicbricks.com/commercial-real-estate',
    'CommercialGuru': 'https://www.commercialguru.com',
    'PropTiger Commercial': 'https://www.proptiger.com/commercial',
    'Tanishq': 'https://www.tanishq.co.in',
    'Malabar Gold': 'https://www.malabargoldanddiamonds.com',
    'PC Jeweller': 'https://www.pcjeweller.com',
    'Senco Gold': 'https://www.sencogoldanddiamonds.com',
    'Myntra': 'https://www.myntra.com',
    'Ajio': 'https://www.ajio.com',
    'Tata CLiQ Luxury': 'https://luxury.tatacliq.com',
    'Nykaa Fashion': 'https://www.nykaafashion.com',
    'Titan': 'https://www.titan.co.in',
    'Ethos Watches': 'https://www.ethoswatches.com',
    'Helios': 'https://www.helioswatchstore.com',
    'Just Watches': 'https://www.justwatches.com',
    'Nykaa': 'https://www.nykaa.com'
  };
  
  const locations = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow'];
  const query = new URLSearchParams(queryStr);
  
  for (let i = 0; i < count; i++) {
    const sourceList = sources[type] || sources.custom;
    const sourceName = sourceList[Math.floor(Math.random() * sourceList.length)];
    const sourceUrl = sourceUrls[sourceName] || 'https://www.example.com';
    
    const loc = location || locations[Math.floor(Math.random() * locations.length)];
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * 10) - 1);
    
    let title, details, price;
    
    if (type === 'mobile') {
      const brands = ['Apple', 'Samsung', 'OnePlus', 'Xiaomi', 'Realme', 'Oppo'];
      const brand = query.get('brand') || brands[Math.floor(Math.random() * brands.length)];
      const models = {
        'Apple': ['iPhone 13', 'iPhone 14', 'iPhone 15', 'iPhone SE'],
        'Samsung': ['Galaxy S22', 'Galaxy S23', 'Galaxy A54', 'Galaxy M34'],
        'OnePlus': ['OnePlus 11', 'OnePlus Nord 3', 'OnePlus 10T', 'OnePlus Nord CE 3'],
        'Xiaomi': ['Redmi Note 12', 'Xiaomi 13', 'Redmi K50i', 'Poco F5'],
        'Realme': ['Realme 11 Pro', 'Realme GT Neo 3', 'Realme 10', 'Realme C55'],
        'Oppo': ['Oppo Reno 10', 'Oppo F23', 'Oppo A78', 'Oppo Find X5']
      };
      const model = query.get('model') || models[brand][Math.floor(Math.random() * models[brand].length)];
      const storage = query.get('storage') || ['64GB', '128GB', '256GB', '512GB'][Math.floor(Math.random() * 4)];
      title = `${brand} ${model} ${storage}`;
      details = `${storage} Storage | ${['New', 'Refurbished', 'Used'][Math.floor(Math.random() * 3)]}`;
      price = randomPrice('mobile');
    } else if (type === 'two-wheeler') {
      const brands = ['Royal Enfield', 'Bajaj', 'TVS', 'Hero', 'Honda', 'Yamaha'];
      const brand = query.get('brand') || brands[Math.floor(Math.random() * brands.length)];
      const models = {
        'Royal Enfield': ['Classic 350', 'Meteor 350', 'Hunter 350', 'Bullet 350'],
        'Bajaj': ['Pulsar NS200', 'Pulsar 220F', 'Dominar 400', 'Platina 110'],
        'TVS': ['Apache RTR 160', 'Jupiter', 'Ntorq 125', 'Raider'],
        'Hero': ['Splendor Plus', 'HF Deluxe', 'Xpulse 200', 'Pleasure+'],
        'Honda': ['Activa 6G', 'Shine', 'Unicorn', 'SP 125'],
        'Yamaha': ['R15 V4', 'FZ-S FI', 'MT-15', 'Fascino 125']
      };
      const model = query.get('model') || models[brand][Math.floor(Math.random() * models[brand].length)];
      const types = ['Scooter', 'Motorcycle', 'Sports Bike', 'Cruiser'];
      const bikeType = query.get('type') || types[Math.floor(Math.random() * types.length)];
      const year = query.get('year') || (2015 + Math.floor(Math.random() * 8));
      title = `${brand} ${model} ${year}`;
      details = `${bikeType} | ${year}`;
      price = randomPrice('two-wheeler');
    } else {
      // Generic fallback for all other types
      title = `${type.charAt(0).toUpperCase() + type.slice(1)} Item ${i+1}`;
      details = `Great condition | Premium quality`;
      price = randomPrice(type);
    }
    
    results.push({
      title,
      price,
      details,
      location: loc,
      source: sourceName,
      url: sourceUrl,
      date
    });
  }
  
  return results;
}

// Generate realistic prices based on item type
function randomPrice(type) {
  switch(type) {
    case 'mobile': return Math.floor(Math.random() * 140000) + 10000;
    case 'two-wheeler': return Math.floor(Math.random() * 250000) + 50000;
    case 'car': return Math.floor(Math.random() * 1500000) + 300000;
    case 'land': return Math.floor(Math.random() * 50000000) + 1000000;
    case 'apartment': return Math.floor(Math.random() * 20000000) + 3000000;
    case 'house': return Math.floor(Math.random() * 25000000) + 5000000;
    case 'business': return Math.floor(Math.random() * 10000000) + 500000;
    case 'commercial': return Math.floor(Math.random() * 30000000) + 3000000;
    case 'gold': return Math.floor(Math.random() * 500000) + 50000;
    case 'clothing': return Math.floor(Math.random() * 195000) + 5000;
    case 'watch': return Math.floor(Math.random() * 495000) + 5000;
    case 'electronics': return Math.floor(Math.random() * 240000) + 10000;
    default: return Math.floor(Math.random() * 99000) + 1000;
  }
}

// Routes for HTML pages with backend interaction
app.get('/WExplore', (req, res) => {
  res.sendFile(path.join(__dirname, 'WExplore.html'));
});

app.get('/AExplore', (req, res) => {
  res.sendFile(path.join(__dirname, 'AExplore.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});