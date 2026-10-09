// seedDemoAccounts.js
// Run once: node seedDemoAccounts.js
// Creates demo accounts for FYP presentation

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mehfoozride';

const passengers = [
  { name: 'Ayesha Khan',    email: 'ayesha@demo.com',   phone: '+923001111001', password: 'password123' },
  { name: 'Zainab Ali',     email: 'zainab@demo.com',   phone: '+923001111002', password: 'password123' },
  { name: 'Sana Mirza',     email: 'sana@demo.com',     phone: '+923001111003', password: 'password123' },
  { name: 'Hira Baig',      email: 'hira@demo.com',     phone: '+923001111004', password: 'password123' },
  { name: 'Nadia Sheikh',   email: 'nadia@demo.com',    phone: '+923001111005', password: 'password123' },
];

const drivers = [
  { name: 'Fatima Malik',   email: 'fatima@demo.com',   phone: '+923002221001', password: 'password123', licensePlate: 'LHR-1001', vehicle: 'Toyota Corolla 2021 White' },
  { name: 'Mariam Hassan',  email: 'mariam@demo.com',   phone: '+923002221002', password: 'password123', licensePlate: 'LHR-1002', vehicle: 'Honda City 2020 Silver' },
  { name: 'Sara Qureshi',   email: 'sara@demo.com',     phone: '+923002221003', password: 'password123', licensePlate: 'LHR-1003', vehicle: 'Suzuki Swift 2022 Red' },
  { name: 'Amna Tariq',     email: 'amna@demo.com',     phone: '+923002221004', password: 'password123', licensePlate: 'LHR-1004', vehicle: 'KIA Picanto 2021 Blue' },
  { name: 'Rabia Iqbal',    email: 'rabia@demo.com',    phone: '+923002221005', password: 'password123', licensePlate: 'LHR-1005', vehicle: 'Toyota Yaris 2023 Beige' },
];

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing demo accounts
    const demoEmails = [
      ...passengers.map(p => p.email),
      ...drivers.map(d => d.email),
      'admin@mehfooz.com',
    ];
    await User.deleteMany({ email: { $in: demoEmails } });
    console.log('🗑️  Cleared old demo accounts');

    // Create Admin
    await User.create({
      name: 'Mehfooz Admin', email: 'admin@mehfooz.com',
      phone: '+923009999001', password: 'admin123',
      role: 'admin', gender: 'female',
      isVerified: true, cnicVerified: true,
    });
    console.log('✅ Admin created: admin@mehfooz.com / admin123');

    // Create Passengers
    for (const p of passengers) {
      await User.create({
        ...p, role: 'passenger', gender: 'female',
        isVerified: true, cnicVerified: true,
        cnic: '35201-1234567-2',
        guardianContacts: [
          { name: 'Mother', phone: '+923001234567', relation: 'Mother', isActive: true },
        ],
      });
    }
    console.log(`✅ ${passengers.length} passenger accounts created`);

    // Create Drivers (all verified and online-ready)
    for (const d of drivers) {
      const [make, model, year, color] = d.vehicle.split(' ');
      await User.create({
        name: d.name, email: d.email, phone: d.phone,
        password: d.password, role: 'driver', gender: 'female',
        isVerified: true, cnicVerified: true,
        cnic: '35201-7654321-4',
        isOnline: false,
        averageRating: (4.5 + Math.random() * 0.5).toFixed(1),
        driverDetails: {
          cnicNumber: '35201-7654321-4',
          licenseNumber: `DL-${Math.floor(10000 + Math.random() * 90000)}`,
          vehicleMake: make || 'Toyota',
          vehicleModel: model || 'Corolla',
          vehicleYear: year || '2021',
          vehicleColor: color || 'White',
          licensePlate: d.licensePlate,
          backgroundCheck: 'passed',
          backgroundNotes: 'Verified by admin during seeding',
        },
      });
    }
    console.log(`✅ ${drivers.length} driver accounts created`);

    console.log('\n════════════════════════════════════════');
    console.log('  🌸 MehfoozRide Demo Accounts Ready');
    console.log('════════════════════════════════════════');
    console.log('  ADMIN:     admin@mehfooz.com     / admin123');
    console.log('  PASSENGER: ayesha@demo.com        / password123');
    console.log('  PASSENGER: zainab@demo.com        / password123');
    console.log('  PASSENGER: sana@demo.com          / password123');
    console.log('  DRIVER:    fatima@demo.com         / password123');
    console.log('  DRIVER:    mariam@demo.com         / password123');
    console.log('  DRIVER:    sara@demo.com           / password123');
    console.log('  (5 passengers + 5 drivers + 1 admin total)');
    console.log('════════════════════════════════════════\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  }
}

seed();
