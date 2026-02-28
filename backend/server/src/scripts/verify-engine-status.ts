
import http from 'http';

const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/engine/status',
    method: 'GET'
};

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('Engine Status:', data);
    });
});

req.on('error', (error) => {
    console.error('Error fetching status:', error.message);
});

req.end();
