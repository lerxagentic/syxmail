import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { email } from '../src/email/email';
import emailService from '../src/service/email-service';
import accountService from '../src/service/account-service';
import settingService from '../src/service/setting-service';
import userService from '../src/service/user-service';
import telegramService from '../src/service/telegram-service';
import roleService from '../src/service/role-service';
import aiService from '../src/service/ai-service';

vi.mock('../src/service/email-service', () => ({ default: { receive: vi.fn(), completeReceive: vi.fn() } }));
vi.mock('../src/service/account-service', () => ({ default: { selectByEmailIncludeDel: vi.fn() } }));
vi.mock('../src/service/setting-service', () => ({ default: { query: vi.fn() } }));
vi.mock('../src/service/user-service', () => ({ default: { selectByIdIncludeDel: vi.fn() } }));
vi.mock('../src/service/role-service', () => ({ default: {
	selectByUserId: vi.fn(), hasAvailDomainPerm: vi.fn(), isBanEmail: vi.fn()
} }));
vi.mock('../src/service/telegram-service', () => ({ default: { sendEmailToBot: vi.fn() } }));
vi.mock('../src/service/att-service', () => ({ default: { addAtt: vi.fn() } }));
vi.mock('../src/service/ai-service', () => ({ default: { extractCode: vi.fn().mockResolvedValue('') } }));
vi.mock('../src/service/verify-record-service', () => ({ default: {} }));

const settings = { receive: 0, noRecipient: 0, tgBotStatus: 1, forwardStatus: 1, ruleType: 0 };
const row = { emailId: 1, userId: 0, accountId: 0 };
const raw = 'From: sender@example.com\r\nTo: inbox@example.com\r\nSubject: Test\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHello';

function message(source = raw, chunks) {
	return {
		from: 'sender@example.com', to: 'inbox@example.com', setReject: vi.fn(), forward: vi.fn(),
		raw: new ReadableStream({ start(controller) {
			for (const chunk of chunks || [new TextEncoder().encode(source)]) controller.enqueue(chunk);
			controller.close();
		} })
	};
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	settingService.query.mockResolvedValue({ ...settings });
	accountService.selectByEmailIncludeDel.mockResolvedValue(undefined);
	emailService.receive.mockResolvedValue(row);
	emailService.completeReceive.mockResolvedValue(row);
	aiService.extractCode.mockResolvedValue('');
});
afterEach(() => vi.restoreAllMocks());

describe('incoming email', () => {
	it('stores and completes a normal message before acknowledging', async () => {
		const msg = message();
		await email(msg, {}, {});
		expect(emailService.receive).toHaveBeenCalledWith({ env: {} }, expect.objectContaining({ sendEmail: 'sender@example.com', text: 'Hello\n' }), [], undefined);
		expect(emailService.completeReceive).toHaveBeenCalledWith({ env: {} }, 7, 1);
		expect(msg.setReject).not.toHaveBeenCalled();
	});
	it('rejects a missing From header instead of throwing a retryable exception', async () => {
		const msg = message(raw.replace('From: sender@example.com\r\n', ''));
		await expect(email(msg, {}, {})).resolves.toBeUndefined();
		expect(msg.setReject).toHaveBeenCalledWith('Missing or invalid From header');
		expect(emailService.receive).not.toHaveBeenCalled();
	});
	it('preserves multibyte MIME text across stream chunks', async () => {
		const bytes = new TextEncoder().encode(raw.replace('Hello', 'Halo ☕'));
		const split = bytes.indexOf(0xe2) + 1;
		await email(message('', [bytes.slice(0, split), bytes.slice(split)]), {}, {});
		expect(emailService.receive.mock.calls[0][1].text).toBe('Halo ☕\n');
	});
	it('keeps delivery successful and forwards when Telegram fails after persistence', async () => {
		settingService.query.mockResolvedValue({ ...settings, tgBotStatus: 0, tgChatId: '123', forwardStatus: 0, forwardEmail: 'verified@example.com' });
		telegramService.sendEmailToBot.mockRejectedValue(new Error('notification unavailable'));
		const msg = message();
		await expect(email(msg, {}, {})).resolves.toBeUndefined();
		expect(emailService.completeReceive).toHaveBeenCalled();
		expect(console.error).toHaveBeenCalled();
		expect(msg.forward).toHaveBeenCalledWith('verified@example.com');
	});
	it('rejects an orphaned account without bypassing recipient permissions', async () => {
		accountService.selectByEmailIncludeDel.mockResolvedValue({ userId: 9, accountId: 2 });
		userService.selectByIdIncludeDel.mockResolvedValue(undefined);
		const msg = message();
		await expect(email(msg, {}, {})).resolves.toBeUndefined();
		expect(msg.setReject).toHaveBeenCalledWith('Recipient not found');
		expect(emailService.receive).not.toHaveBeenCalled();
	});
	it('still propagates persistence failures so the sender can retry', async () => {
		const failure = new Error('D1 unavailable');
		emailService.receive.mockRejectedValue(failure);
		await expect(email(message(), {}, {})).rejects.toBe(failure);
		expect(emailService.completeReceive).not.toHaveBeenCalled();
	});
	it('still propagates finalization failures', async () => {
		const failure = new Error('D1 update failed');
		emailService.completeReceive.mockRejectedValue(failure);
		await expect(email(message(), {}, {})).rejects.toBe(failure);
	});
	it('honors blocked sender and suspended reception', async () => {
		settingService.query.mockResolvedValue({ ...settings, blackFrom: 'example.com' });
		const blocked = message();
		await email(blocked, {}, {});
		expect(blocked.setReject).toHaveBeenCalledWith('Message rejected');
		settingService.query.mockResolvedValue({ ...settings, receive: 1 });
		const suspended = message();
		await email(suspended, {}, {});
		expect(suspended.setReject).toHaveBeenCalledWith('Service suspended');
		expect(emailService.receive).not.toHaveBeenCalled();
	});
	it('honors recipient domain permissions', async () => {
		accountService.selectByEmailIncludeDel.mockResolvedValue({ userId: 9 });
		userService.selectByIdIncludeDel.mockResolvedValue({ email: 'user@example.com' });
		roleService.selectByUserId.mockResolvedValue({ banEmail: '', availDomain: '' });
		roleService.hasAvailDomainPerm.mockReturnValue(false);
		const msg = message();
		await email(msg, {}, {});
		expect(msg.setReject).toHaveBeenCalledWith('The recipient is not authorized to use this domain.');
		expect(emailService.receive).not.toHaveBeenCalled();
	});
});
