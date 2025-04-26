import pm2 from'pm2'

const appData = [
   {
      name: 'secret-bot',
      script: './dist/src/main.js',
      node_args: '-r dotenv/config --es-module-specifier-resolution=node',
   }
]

pm2.connect((err) => {
  if (err) {
    console.error(err)
    process.exit(2)
  }
  pm2.start(appData, (err, apps) => {
    if (err) {
      console.error(err)
      return pm2.disconnect()
    }
    pm2.disconnect()
  })
})
