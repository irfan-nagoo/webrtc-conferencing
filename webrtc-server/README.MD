# webrtc-server

The webrtc-server is the signaling server which actually enables to establish a call/session between the peers. This server also enables exchange of vital ICE information, mute/unmute, share/unshare, close etc. information between the peers. This signaling server is secured and supports https and wss protocols. Here are the simple steps to setup this server:

    1. Install NodeJS (16+) and NPM
    2. Run this command to install required packages:

          npm run install
    3. Run this command to start the server:

          Node server.js
    4. Signaling server is up and running at port 9443


## Securing Web/Application servers (enabling https)

The SSL/TLS protocol encrypts the communication between the client and the server using a symmetric encryption algorithms like AES (key size typically 128 or 256 bit) e.g. ssh  or asymmetric encryption algorithm like RSA (key size typically 2048 or 4096 bit) e.g. https. A certificate and private key is generated as part of SSL enablement process which are then installed on the web/application server.

In order enable https for any web/application server, we need to generate self signed/CA signed certificate (or public/private key combination pair) using any of the tools like "keytool" or "openssl". The command used for both of these tools are similar. Here are the commands using openssl to generate SSL artifacts.

### Self signed certificate

Run this command to generate self signed certificate and a private key (RSA 4096 bit) generally used for internal purpose:

                    
		openssl req -x509  \   
			    -sha256 \ 
			    -days 3560 \           
			    -nodes  \           
			    -newkey rsa:4096 \                    
			    -keyout key.pem \
			    -subj '/CN=WebRTC App/C=IN/ST=J&K/L=Baramulla/O=WebRTC Inc' \
			    -out cert.pem

### CA (Certifcate Authority) signed certificate

Here are the steps to generate CA signed certificate:

1. First generate CA key (RSA 4096 bit):

            openssl genrsa -aes256 -out CAkey.pem 4096
2. Now, generate CA certificate:

            openssl req -x509 -new -nodes -key CAkey.pem -sha256 -days 3560 -out CAcert.pem
3. Next step is to create a CSR (Certificate Signing Request):

            openssl req -new -nodes -out cert.csr -newkey rsa:4096 -keyout key.pem -subj '/CN=WebRTC App/C=IN/ST=J&K/L=Baramulla/O=WebRTC Inc'

   We can also create CSR as the first step in case we do not want to create a new CA and want to get our certificate signed by other CA or and well know CA's 
   like Commodo, DigiCert etc. which are easily recognized by all major browsers.

4. Now, sign the CSR with the CA key and cert created in step 1 and 2:

            openssl x509 -req -in cert.csr -CA CAcert.pem -CAkey CAkey.pem -CAcreateserial -out cert.pem -days 3560 -sha256
5. Install the certificate and private key in the web/application server. All web/application server have sufficient documentation on how to install certificate and private key.
