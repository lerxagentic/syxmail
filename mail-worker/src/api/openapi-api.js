import app from '../hono/hono';

app.get('/openapi.json', (c) => {
	const origin = new URL(c.req.url).origin;

	const spec = {
		openapi: '3.0.3',
		info: {
			title: 'SyxMail OpenAPI',
			description: 'OpenAPI Specification for SyxMail Temporary & Cloud Mail Service',
			version: '1.0.0'
		},
		servers: [
			{
				url: origin + '/api',
				description: 'SyxMail API Base URL'
			}
		],
		components: {
			securitySchemes: {
				ApiKeyAuth: {
					type: 'apiKey',
					in: 'header',
					name: 'X-API-Key',
					description: 'API Key generated from SyxMail Dashboard'
				},
				BearerAuth: {
					type: 'http',
					scheme: 'bearer',
					bearerFormat: 'JWT or API Key'
				}
			}
		},
		security: [
			{ ApiKeyAuth: [] },
			{ BearerAuth: [] }
		],
		paths: {
			'/config': {
				get: {
					summary: 'Get System Configuration',
					description: 'Retrieve system parameters including available email domains and default roles.',
					responses: {
						'200': {
							description: 'Successful response',
							content: {
								'application/json': {
									example: {
										defaultRole: 'Regular User',
										emailDomains: 'domain.com,example.org',
										adminContact: 'admin@domain.com',
										maxEmails: '20'
									}
								}
							}
						}
					}
				}
			},
			'/emails/generate': {
				post: {
					summary: 'Generate Temporary Mailbox',
					description: 'Create a new temporary mailbox account under user profile.',
					requestBody: {
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										name: { type: 'string', description: 'Prefix for email (optional)' },
										domain: { type: 'string', description: 'Email domain (optional)' },
										expiryTime: { type: 'integer', description: 'Validity in ms (optional)' }
									}
								}
							}
						}
					},
					responses: {
						'200': {
							description: 'Mailbox generated successfully',
							content: {
								'application/json': {
									example: {
										id: '12',
										email: 'testbot@domain.com'
									}
								}
							}
						}
					}
				}
			},
			'/emails': {
				get: {
					summary: 'List All Mailboxes',
					description: 'Get all created mailboxes for authenticated user.',
					responses: {
						'200': {
							description: 'List of mailboxes',
							content: {
								'application/json': {
									example: [
										{ id: '12', email: 'testbot@domain.com', createTime: '2026-08-03 21:00:00' }
									]
								}
							}
						}
					}
				}
			},
			'/emails/{emailId}': {
				get: {
					summary: 'Get Messages for Mailbox',
					description: 'Retrieve incoming email messages for a given mailbox ID.',
					parameters: [
						{ name: 'emailId', in: 'path', required: true, schema: { type: 'string' } }
					],
					responses: {
						'200': {
							description: 'List of messages'
						}
					}
				},
				delete: {
					summary: 'Delete Mailbox',
					description: 'Revoke and delete a specific mailbox ID.',
					parameters: [
						{ name: 'emailId', in: 'path', required: true, schema: { type: 'string' } }
					],
					responses: {
						'200': { description: 'Mailbox deleted' }
					}
				}
			},
			'/emails/{emailId}/{messageId}': {
				get: {
					summary: 'Read Single Message Content',
					description: 'Fetch content and body of a specific email message.',
					parameters: [
						{ name: 'emailId', in: 'path', required: true, schema: { type: 'string' } },
						{ name: 'messageId', in: 'path', required: true, schema: { type: 'string' } }
					],
					responses: {
						'200': { description: 'Message detail' }
					}
				}
			},
			'/emails/{emailId}/send': {
				post: {
					summary: 'Send Email from Mailbox',
					description: 'Send an outgoing email message from a specific mailbox ID.',
					parameters: [
						{ name: 'emailId', in: 'path', required: true, schema: { type: 'string' } }
					],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['to', 'subject', 'content'],
									properties: {
										to: { type: 'string' },
										subject: { type: 'string' },
										content: { type: 'string' }
									}
								}
							}
						}
					},
					responses: {
						'200': { description: 'Email sent successfully' }
					}
				}
			},
			'/emails/{emailId}/wait': {
				get: {
					summary: 'Wait for Verification Email (Realtime Long Polling)',
					description: 'Waits for a new incoming email in the mailbox up to timeout seconds. Automatically extracts OTP verification code and verification link.',
					parameters: [
						{ name: 'emailId', in: 'path', required: true, schema: { type: 'string' }, description: 'Mailbox ID' },
						{ name: 'timeout', in: 'query', required: false, schema: { type: 'integer', default: 60 }, description: 'Timeout in seconds (max 120)' },
						{ name: 'lastMessageId', in: 'query', required: false, schema: { type: 'integer' }, description: 'Wait for message with ID greater than this' }
					],
					responses: {
						'200': {
							description: 'Message detail with extracted code & links or timeout response',
							content: {
								'application/json': {
									example: {
										id: '105',
										messageId: '105',
										sendEmail: 'noreply@service.com',
										sendName: 'Verification Service',
										toEmail: 'bot@lerxagentic.tech',
										subject: 'Your code is 849201',
										text: 'Code: 849201. Or click https://service.com/verify?token=abc',
										content: '<p>Code: 849201</p>',
										code: '849201',
										verificationCode: '849201',
										verificationUrl: 'https://service.com/verify?token=abc',
										links: ['https://service.com/verify?token=abc'],
										createTime: '2026-08-03 22:30:00'
									}
								}
							}
						}
					}
				}
			},
			'/emails/wait': {
				get: {
					summary: 'Wait for Verification Email by Address',
					description: 'Waits for incoming email by address or emailId with long polling timeout. Auto extracts OTP code & link.',
					parameters: [
						{ name: 'address', in: 'query', required: false, schema: { type: 'string' }, description: 'Email address' },
						{ name: 'emailId', in: 'query', required: false, schema: { type: 'string' }, description: 'Mailbox ID' },
						{ name: 'timeout', in: 'query', required: false, schema: { type: 'integer', default: 60 }, description: 'Timeout in seconds (max 120)' }
					],
					responses: {
						'200': { description: 'Message detail with extracted code & links' }
					}
				}
			},
			'/user/role': {
				get: {
					summary: 'Get Authenticated User Role & Domain Permissions',
					description: 'Retrieve role details, allowed domains, max address limit, and sending quotas for current API Key user.',
					responses: {
						'200': {
							description: 'User role details',
							content: {
								'application/json': {
									example: {
										userId: 1,
										email: 'premium@lerxagentic.tech',
										roleId: 2,
										roleName: 'Premium',
										availDomains: ['lerxagentic.tech'],
										allSystemDomains: ['lerxagentic.tech', 'leraie.tech'],
										maxAddress: 100,
										maxEmails: '100',
										sendType: 'count',
										sendCount: 5,
										banEmail: []
									}
								}
							}
						}
					}
				}
			},
			'/domains': {
				get: {
					summary: 'Get Available Email Domains per Role',
					description: 'Get list of permitted email domains for authenticated user role vs all system domains.',
					responses: {
						'200': { description: 'Permitted and system domains' }
					}
				}
			},
			'/apiKey/list': {
				get: {
					summary: 'List User API Keys',
					description: 'List API Keys created by the logged-in user.',
					responses: {
						'200': { description: 'List of API Keys' }
					}
				}
			},
			'/apiKey/create': {
				post: {
					summary: 'Create API Key',
					description: 'Generate a new API Key for user authentication.',
					requestBody: {
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['name'],
									properties: {
										name: { type: 'string' }
									}
								}
							}
						}
					},
					responses: {
						'200': { description: 'API Key generated' }
					}
				}
			}
		}
	};

	return c.json(spec);
});

app.get('/swagger', (c) => {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SyxMail API Documentation - Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; background: #fafafa; }
    .topbar { display: none !important; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js" charset="UTF-8"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;
	return c.html(html);
});
