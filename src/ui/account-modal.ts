import { App, ButtonComponent, Modal, Notice, Setting } from 'obsidian';
import { PROVIDER_LIST, getProvider } from '../core/providers/registry';
import { LANGUAGES, type TtsAccountConfig } from '../core/providers/types';
import {
  AZURE_OUTPUT_FORMATS,
  outputFormatFor,
  type AzureOutputFormat,
} from '../core/providers/azure';
import { newAccount } from '../core/accounts';
import { t } from '../i18n';

/** 账号新建/编辑弹窗：供应商选择 + 供应商相关字段 + 测试连接（音色在播放器面板上按次选择）。 */
export class AccountModal extends Modal {
  private account: TtsAccountConfig;

  constructor(
    app: App,
    account: TtsAccountConfig | null,
    private onSave: (account: TtsAccountConfig) => void,
  ) {
    super(app);
    // 账号配置是纯 JSON 数据，JSON 克隆零平台风险
    this.account = account
      ? (JSON.parse(JSON.stringify(account)) as TtsAccountConfig)
      : newAccount(PROVIDER_LIST[0].id);
  }

  override async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.titleEl.setText(
      this.account.name ? t('account.modal-title-edit') : t('account.modal-title-new'),
    );
    this.renderForm();
  }

  private renderForm(): void {
    const body = this.contentEl;
    body.empty();

    new Setting(body).setName(t('account.provider')).addDropdown((d) => {
      for (const p of PROVIDER_LIST) {
        if (p.capabilities.direct) continue; // 系统语音不是账号
        d.addOption(p.id, p.name);
      }
      d.setValue(this.account.providerId);
      d.onChange((v) => {
        this.account = newAccount(v, { name: this.account.name });
        this.renderForm();
      });
    });

    new Setting(body).setName(t('account.name')).addText((txt) =>
      txt.setValue(this.account.name).onChange((v) => {
        this.account.name = v;
      }),
    );

    const provider = getProvider(this.account.providerId);
    if (provider?.id === 'qwen3-tts' || provider?.id === 'openai-compatible') {
      new Setting(body)
        .setName(t('account.base-url'))
        .setDesc('http://host:port')
        .addText((txt) =>
          txt
            .setPlaceholder(
              provider?.id === 'qwen3-tts' ? 'http://127.0.0.1:8765' : 'http://127.0.0.1:8880',
            )
            .setValue(this.account.baseUrl ?? '')
            .onChange((v) => {
              this.account.baseUrl = v.trim();
            }),
        );
    }
    if (provider?.id === 'mimo') {
      new Setting(body)
        .setName(t('account.base-url'))
        .setDesc('api.xiaomimimo.com')
        .addText((txt) =>
          txt
            .setPlaceholder('api.xiaomimimo.com')
            .setValue(this.account.baseUrl ?? '')
            .onChange((v) => {
              this.account.baseUrl = v.trim();
            }),
        );
    }

    if (provider?.id !== 'qwen3-tts') {
      new Setting(body).setName(t('account.api-key')).addText((txt) => {
        txt.inputEl.type = 'password';
        txt.setValue(this.account.apiKey ?? '').onChange((v) => {
          this.account.apiKey = v.trim();
        });
      });
    }

    if (provider?.id === 'azure-tts') {
      new Setting(body)
        .setName(t('account.azure-region'))
        .setDesc(t('account.azure-region-desc'))
        .addText((txt) =>
          txt
            .setPlaceholder('eastus')
            .setValue(this.account.region ?? '')
            .onChange((v) => {
              this.account.region = v.trim();
            }),
        );

      // 输出格式：码率变 → extra 变 → 缓存键变 → 自动重新合成
      new Setting(body)
        .setName(t('account.azure-format'))
        .setDesc(t('account.azure-format-desc'))
        .addDropdown((d) => {
          const labels: Record<AzureOutputFormat, string> = {
            'audio-48khz-192kbitrate-mono-mp3': t('account.azure-format-192'),
            'audio-48khz-96kbitrate-mono-mp3': t('account.azure-format-96'),
            'audio-24khz-48kbitrate-mono-mp3': t('account.azure-format-48'),
          };
          for (const f of AZURE_OUTPUT_FORMATS) d.addOption(f, labels[f]);
          d.setValue(outputFormatFor(this.account));
          d.onChange((v) => {
            this.account.extra = { ...(this.account.extra ?? {}), outputFormat: v };
          });
        });
    }

    if (provider?.id === 'openai-compatible') {
      new Setting(body).setName(t('account.model-optional')).addText((txt) =>
        txt.setValue(this.account.model ?? '').onChange((v) => {
          this.account.model = v.trim();
        }),
      );
    }

    // 音色只在账号里保留「无发现端点」供应商的默认值（面板上按次切换）；
    // Qwen3/MiMo 等有音色来源的供应商使用默认音色，不在账号里配置
    if (provider?.id === 'openai-compatible') {
      new Setting(body)
        .setName(t('account.voice-default-optional'))
        .setDesc(t('account.voice-default-desc'))
        .addText((txt) =>
          txt
            .setPlaceholder('alloy')
            .setValue(this.account.voice)
            .onChange((v) => {
              this.account.voice = v.trim();
            }),
        );
    }

    new Setting(body).setName(t('account.language')).addDropdown((d) => {
      const labels: Record<string, string> = {
        Chinese: t('common.language.chinese'),
        English: t('common.language.english'),
        Japanese: t('common.language.japanese'),
        Korean: t('common.language.korean'),
        Auto: t('common.language.auto'),
      };
      for (const l of LANGUAGES) d.addOption(l, labels[l] ?? l);
      d.setValue(this.account.language);
      d.onChange((v) => {
        this.account.language = v;
      });
    });

    // 预生成队列：并发与本地 TTS 标记
    new Setting(body)
      .setName(t('account.max-concurrency'))
      .setDesc(t('account.max-concurrency-desc'))
      .addText((txt) => {
        txt.inputEl.type = 'number';
        txt.inputEl.min = '1';
        txt.inputEl.max = '8';
        txt.setValue(String(this.account.maxConcurrency ?? 1));
        txt.onChange((v) => {
          const n = Math.min(8, Math.max(1, Math.floor(Number(v) || 1)));
          this.account.maxConcurrency = n;
        });
      });

    new Setting(body)
      .setName(t('account.local-tts'))
      .setDesc(t('account.local-tts-desc'))
      .addToggle((tg) =>
        tg.setValue(!!this.account.isLocalTts).onChange((v) => {
          this.account.isLocalTts = v;
        }),
      );

    if (provider?.id === 'mimo') {
      new Setting(body)
        .setName(t('account.style'))
        .setDesc(t('account.style-desc'))
        .addText((txt) =>
          txt.setValue(this.account.extra?.['style'] ?? '').onChange((v) => {
            this.account.extra = { ...(this.account.extra ?? {}), style: v };
          }),
        );
    }

    new Setting(body).addButton((b: ButtonComponent) =>
      b.setButtonText(t('account.test')).onClick(async () => {
        if (!provider?.checkHealth) return;
        b.setDisabled(true);
        const r = await provider.checkHealth(this.account);
        b.setDisabled(false);
        new Notice(r.ok ? t('account.test-ok') : `${t('account.test-fail')}：${r.message ?? ''}`);
      }),
    );

    new Setting(body)
      .addButton((b: ButtonComponent) =>
        b
          .setCta()
          .setButtonText(t('account.save'))
          .onClick(() => {
            if (!this.account.name.trim()) {
              new Notice(t('account.name-required'));
              return;
            }
            this.onSave(this.account);
            this.close();
          }),
      )
      .addButton((b: ButtonComponent) =>
        b.setButtonText(t('account.cancel')).onClick(() => this.close()),
      );
  }
}
