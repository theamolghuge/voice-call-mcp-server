import net from 'net';

/**
 * Checks if a port is already in use
 * @param port - The port number to check
 * @returns Promise that resolves to true if port is in use, false otherwise
 */
export async function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer()
            .once('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(true);
                } else {
                    resolve(false);
                }
            })
            .once('listening', () => {
                server.close();
                resolve(false);
            })
            .listen(port);
    });
}
