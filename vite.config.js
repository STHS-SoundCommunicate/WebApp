import basicSsl from '@vitejs/plugin-basic-ssl'

export default {
    plugins: [
        basicSsl()
    ],
    build: {
        outDir: 'docs',
        rollupOptions: {
            input: {
                main: 'index.html',
                receiver: 'receiver.html',
                player: 'player.html',
            },
        },
    }
}