import mongoose from 'mongoose'

export async function connectDB() {
  try {
    // Get fresh environment variable each time
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/prompd-editor'
    console.log('Attempting to connect to MongoDB:', MONGODB_URI.substring(0, 20) + '...')
    console.log('Full URI check:', process.env.MONGODB_URI ? 'FOUND' : 'NOT FOUND')
    const conn = await mongoose.connect(MONGODB_URI, {
      // Connection options for reliability
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      bufferCommands: false // Disable mongoose buffering
    })

    console.log(`MongoDB Connected: ${conn.connection.host}`)

    // Drop problematic unique index on sessions.sessionId if it exists
    // This index causes duplicate key errors when users have no sessions (null values)
    try {
      const usersCollection = conn.connection.collection('users')
      const indexes = await usersCollection.indexes()
      const problematicIndex = indexes.find(idx =>
        idx.key && idx.key['sessions.sessionId'] !== undefined && idx.unique === true
      )
      if (problematicIndex) {
        console.log('Dropping problematic unique index on sessions.sessionId...')
        await usersCollection.dropIndex('sessions.sessionId_1')
        console.log('Index dropped successfully')
      }
    } catch (indexError) {
      // Index may not exist, that's fine
      if (indexError.code !== 27) { // 27 = index not found
        console.warn('Could not check/drop sessions index:', indexError.message)
      }
    }

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err)
    })

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected')
    })

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected')
    })

    return conn
  } catch (error) {
    console.error('Database connection failed:', error)
    throw error
  }
}

export async function disconnectDB() {
  try {
    await mongoose.connection.close()
    console.log('MongoDB connection closed')
  } catch (error) {
    console.error('Error closing MongoDB connection:', error)
    throw error
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    await disconnectDB()
    process.exit(0)
  } catch (error) {
    console.error('Error during graceful shutdown:', error)
    process.exit(1)
  }
})