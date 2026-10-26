# Azure 音色清单（中文 / 英文 / 日语 / 韩语）

> 本文是某账号 `eastus` 订阅在 2026-10-26 的实测快照：可用音色共 **974** 个，四语种 **348** 个。数量会随订阅与微软更新变化，仅作挑选参考。
>
> 其中英文最多（221），中文次之（93）——这也是下拉框必须靠 `azure-voices.json` 收窄的原因。

## 总览

| 语言 | 合计 | 女 | 男 | 中性 | HD 音色 | 多语种 | GA | Preview | 地区数 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 中文 | **93** | 51 | 41 | 1 | 16 | 9 | 62 | 31 | 10 |
| 英文 | **221** | 113 | 99 | 9 | 71 | 35 | 159 | 62 | 14 |
| 日语 | **10** | 5 | 5 | 0 | 2 | 1 | 9 | 1 | 1 |
| 韩语 | **24** | 12 | 12 | 0 | 8 | 1 | 12 | 12 | 1 |

## 类型说明

| 标记 | 含义 | 对听感的影响 |
| --- | --- | --- |
| （无） | 标准神经音色（Neural） | 24 kHz 合成，稳定、便宜 |
| `HD` | DragonHD 基础模型 | 48 kHz、LLM 驱动，韵律最自然 |
| `HD-Flash` | DragonHD Flash | HD 的轻量版，延迟更低 |
| `HD-Omni` | DragonHD Omni | 支持 `mstts:express-as` 风格与词边界事件 |
| `Turbo` | Turbo 系列 | 人格接近 Azure OpenAI 音色，支持完整 SSML |
| `多语种` | ModelSeries 含 Multilingual | 自动语言检测，中英混排更稳 |
| `方言` | locale 三段式（如 zh-CN-liaoning） | 东北话 / 陕西话 / 四川话等 |

`GA` = 正式可用；`Preview` = 预览版，行为可能变动。

# 中文（93）

地区分布：zh-CN 79　·　zh-HK 3　·　zh-TW 3　·　zh-CN-liaoning 2　·　en-US 1　·　zh-CN-guangxi 1　·　zh-CN-henan 1　·　zh-CN-shaanxi 1　·　zh-CN-shandong 1　·　zh-CN-sichuan 1

## 女声（51）

| # | 音色 ID | 名称 | 地区 | 类型 | 状态 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `zh-CN-Xiaochen:DragonHDLatestNeural` | Xiaochen Dragon HD Latest | zh-CN | HD | GA |
| 2 | `zh-CN-Xiaochen:DragonHDFlashLatestNeural` | Xiaochen Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 3 | `zh-CN-XiaochenMultilingualNeural` | 晓辰 多语言 | zh-CN | 多语种 | GA |
| 4 | `zh-CN-XiaochenNeural` | 晓辰 | zh-CN | 标准 | GA |
| 5 | `zh-CN-Xiaohan:DragonHDFlashLatestNeural` | Xiaohan Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 6 | `zh-CN-XiaohanNeural` | 晓涵 | zh-CN | 标准 | GA |
| 7 | `zh-CN-Xiaoke:DragonHDFlashLatestNeural` | Xiaoke Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 8 | `zh-CN-XiaomengNeural` | 晓梦 | zh-CN | 标准 | GA |
| 9 | `zh-CN-Xiaomo:DragonHDFlashLatestNeural` | Xiaomo Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 10 | `zh-CN-XiaomoNeural` | 晓墨 | zh-CN | 标准 | GA |
| 11 | `zh-CN-Xiaoqi:DragonHDFlashLatestNeural` | Xiaoqi Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 12 | `zh-CN-XiaoqiuNeural` | 晓秋 | zh-CN | 标准 | GA |
| 13 | `zh-CN-Xiaorou:DragonHDFlashLatestNeural` | Xiaorou Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 14 | `zh-CN-XiaorouNeural` | 晓柔 | zh-CN | 标准 | GA |
| 15 | `zh-CN-XiaoruiNeural` | 晓睿 | zh-CN | 标准 | GA |
| 16 | `zh-CN-Xiaoshuang:DragonHDFlashLatestNeural` | Xiaoshuang Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 17 | `zh-CN-XiaoshuangMultilingualNeural` | 晓双 多语言 | zh-CN | 多语种 | GA |
| 18 | `zh-CN-XiaoshuangNeural` | 晓双 | zh-CN | 标准 | GA |
| 19 | `zh-CN-Xiaoxiao:DragonHDFlashLatestNeural` | Xiaoxiao Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 20 | `zh-CN-Xiaoxiao2:DragonHDFlashLatestNeural` | Xiaoxiao2 Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 21 | `zh-CN-XiaoxiaoDialectsNeural` | 晓晓 方言 | zh-CN | 多语种 | GA |
| 22 | `zh-CN-XiaoxiaoMultilingualNeural` | 晓晓 多语言 | zh-CN | 多语种 | GA |
| 23 | `zh-CN-XiaoxiaoNeural` | 晓晓 | zh-CN | 标准 | GA |
| 24 | `zh-CN-XiaoyanNeural` | 晓颜 | zh-CN | 标准 | GA |
| 25 | `zh-CN-Xiaoyi:DragonHDFlashLatestNeural` | Xiaoyi Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 26 | `zh-CN-XiaoyiNeural` | 晓伊 | zh-CN | 标准 | GA |
| 27 | `zh-CN-Xiaoyou:DragonHDFlashLatestNeural` | Xiaoyou Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 28 | `zh-CN-XiaoyouMultilingualNeural` | 晓悠 多语言 | zh-CN | 多语种 | GA |
| 29 | `zh-CN-XiaoyouNeural` | 晓悠 | zh-CN | 标准 | GA |
| 30 | `zh-CN-Xiaoyu:DragonHDFlashLatestNeural` | Xiaoyu Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 31 | `zh-CN-XiaoyuMultilingualNeural` | 晓宇 多语言 | zh-CN | 多语种 | GA |
| 32 | `zh-CN-XiaozhenNeural` | 晓甄 | zh-CN | 标准 | GA |
| 33 | `zh-HK-HiuGaaiNeural` | 曉佳 | zh-HK | 标准 | GA |
| 34 | `zh-HK-HiuMaanNeural` | 曉曼 | zh-HK | 标准 | GA |
| 35 | `zh-TW-HsiaoChenNeural` | 曉臻 | zh-TW | 标准 | GA |
| 36 | `zh-TW-HsiaoYuNeural` | 曉雨 | zh-TW | 标准 | GA |
| 37 | `zh-CN-Harper:MAI-Voice-2.1` | Harper MAI-Voice-2.1 | zh-CN | 标准 | Preview |
| 38 | `zh-CN-Lan:MAI-Voice-2` | Lan MAI-Voice-2 | zh-CN | 标准 | Preview |
| 39 | `zh-CN-Lan:MAI-Voice-2.1` | Lan MAI-Voice-2.1 | zh-CN | 标准 | Preview |
| 40 | `zh-CN-Maroonallegro:DragonHDOmniLatestNeural` | Maroonallegro Dragon HD Omni Latest | zh-CN | HD-Omni | Preview |
| 41 | `zh-CN-Mei:MAI-Voice-2` | Mei MAI-Voice-2 | zh-CN | 标准 | Preview |
| 42 | `zh-CN-Mei:MAI-Voice-2.1` | Mei MAI-Voice-2.1 | zh-CN | 标准 | Preview |
| 43 | `zh-CN-Xiaoyue:DragonHDOmniLatestNeural` | Xiaoyue Dragon HD Omni Latest | zh-CN | HD-Omni | Preview |
| 44 | `zh-CN-Harper:MAI-Voice-2.1-Flash` | Harper MAI-Voice-2.1-Flash | zh-CN | 标准 | Preview |
| 45 | `zh-CN-Lan:MAI-Voice-2-Flash` | Lan MAI-Voice-2-Flash | zh-CN | 标准 | Preview |
| 46 | `zh-CN-Lan:MAI-Voice-2.1-Flash` | Lan MAI-Voice-2.1-Flash | zh-CN | 标准 | Preview |
| 47 | `zh-CN-liaoning-XiaobeiNeural` | 晓北 辽宁 | zh-CN-liaoning | 方言 | Preview |
| 48 | `zh-CN-Mei:MAI-Voice-2-Flash` | Mei MAI-Voice-2-Flash | zh-CN | 标准 | Preview |
| 49 | `zh-CN-Mei:MAI-Voice-2.1-Flash` | Mei MAI-Voice-2.1-Flash | zh-CN | 标准 | Preview |
| 50 | `zh-CN-shaanxi-XiaoniNeural` | 晓妮 | zh-CN-shaanxi | 方言 | Preview |
| 51 | `zh-CN-Xiaoqi:DragonLatestNeural` | Xiaoqi Dragon Latest | zh-CN | 标准 | Preview |

## 男声（41）

| # | 音色 ID | 名称 | 地区 | 类型 | 状态 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `zh-CN-Yunfan:DragonHDLatestNeural` | Yunfan Dragon HD Latest | zh-CN | HD | GA |
| 2 | `zh-CN-henan-YundengNeural` | 云登 | zh-CN-henan | 方言 | GA |
| 3 | `zh-CN-shandong-YunxiangNeural` | 云翔 | zh-CN-shandong | 方言 | GA |
| 4 | `zh-CN-Yunfan:DragonHDFlashLatestNeural` | Yunfan Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 5 | `zh-CN-YunfanMultilingualNeural` | Yunfan Multilingual | zh-CN | 多语种 | GA |
| 6 | `zh-CN-Yunfeng:DragonHDFlashLatestNeural` | Yunfeng Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 7 | `zh-CN-YunfengNeural` | 云枫 | zh-CN | 标准 | GA |
| 8 | `zh-CN-Yunhan:DragonHDFlashLatestNeural` | Yunhan Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 9 | `zh-CN-YunhaoNeural` | 云皓 | zh-CN | 标准 | GA |
| 10 | `zh-CN-YunjianNeural` | 云健 | zh-CN | 标准 | GA |
| 11 | `zh-CN-Yunjie:DragonHDFlashLatestNeural` | Yunjie Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 12 | `zh-CN-YunjieNeural` | 云杰 | zh-CN | 标准 | GA |
| 13 | `zh-CN-Yunxi:DragonHDFlashLatestNeural` | Yunxi Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 14 | `zh-CN-Yunxia:DragonHDFlashLatestNeural` | Yunxia Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 15 | `zh-CN-YunxiaNeural` | 云夏 | zh-CN | 标准 | GA |
| 16 | `zh-CN-Yunxiao:DragonHDFlashLatestNeural` | Yunxiao Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 17 | `zh-CN-YunxiaoMultilingualNeural` | Yunxiao Multilingual | zh-CN | 多语种 | GA |
| 18 | `zh-CN-YunxiNeural` | 云希 | zh-CN | 标准 | GA |
| 19 | `zh-CN-YunyangNeural` | 云扬 | zh-CN | 标准 | GA |
| 20 | `zh-CN-Yunye:DragonHDFlashLatestNeural` | Yunye Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 21 | `zh-CN-YunyeNeural` | 云野 | zh-CN | 标准 | GA |
| 22 | `zh-CN-Yunyi:DragonHDFlashLatestNeural` | Yunyi Dragon HD Flash Latest | zh-CN | HD-Flash | GA |
| 23 | `zh-CN-YunyiMultilingualNeural` | 云逸 多语言 | zh-CN | 多语种 | GA |
| 24 | `zh-CN-YunzeNeural` | 云泽 | zh-CN | 标准 | GA |
| 25 | `zh-HK-WanLungNeural` | 雲龍 | zh-HK | 标准 | GA |
| 26 | `zh-TW-YunJheNeural` | 雲哲 | zh-TW | 标准 | GA |
| 27 | `zh-CN-Bo:MAI-Voice-2` | Bo MAI-Voice-2 | zh-CN | 标准 | Preview |
| 28 | `zh-CN-Bo:MAI-Voice-2.1` | Bo MAI-Voice-2.1 | zh-CN | 标准 | Preview |
| 29 | `zh-CN-Grant:MAI-Voice-2.1` | Grant MAI-Voice-2.1 | zh-CN | 标准 | Preview |
| 30 | `zh-CN-Wei:MAI-Voice-2` | Wei MAI-Voice-2 | zh-CN | 标准 | Preview |
| 31 | `zh-CN-Wei:MAI-Voice-2.1` | Wei MAI-Voice-2.1 | zh-CN | 标准 | Preview |
| 32 | `zh-CN-Yunqi:DragonHDOmniLatestNeural` | Yunqi Dragon HD Omni Latest | zh-CN | HD-Omni | Preview |
| 33 | `zh-CN-Bo:MAI-Voice-2-Flash` | Bo MAI-Voice-2-Flash | zh-CN | 标准 | Preview |
| 34 | `zh-CN-Bo:MAI-Voice-2.1-Flash` | Bo MAI-Voice-2.1-Flash | zh-CN | 标准 | Preview |
| 35 | `zh-CN-Grant:MAI-Voice-2.1-Flash` | Grant MAI-Voice-2.1-Flash | zh-CN | 标准 | Preview |
| 36 | `zh-CN-guangxi-YunqiNeural` | 云奇 广西 | zh-CN-guangxi | 方言 | Preview |
| 37 | `zh-CN-liaoning-YunbiaoNeural` | 云彪 辽宁 | zh-CN-liaoning | 方言 | Preview |
| 38 | `zh-CN-sichuan-YunxiNeural` | 云希 四川 | zh-CN-sichuan | 方言 | Preview |
| 39 | `zh-CN-Wei:MAI-Voice-2-Flash` | Wei MAI-Voice-2-Flash | zh-CN | 标准 | Preview |
| 40 | `zh-CN-Wei:MAI-Voice-2.1-Flash` | Wei MAI-Voice-2.1-Flash | zh-CN | 标准 | Preview |
| 41 | `zh-CN-Yunfan:DragonLatestNeural` | Yunfan Dragon Latest | zh-CN | 标准 | Preview |

## 中性 / 多说话人（1）

| # | 音色 ID | 名称 | 地区 | 类型 | 状态 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `zh-Multitalker:DragonHDLatestNeural` | Chinese Multitalker Dragon HD Latest | en-US | HD | Preview |

# 英文（221）

地区分布：en-US 131　·　en-GB 25　·　en-IN 24　·　en-AU 21　·　en-CA 2　·　en-HK 2　·　en-IE 2　·　en-KE 2　·　en-NG 2　·　en-NZ 2　·　en-PH 2　·　en-SG 2　·　en-TZ 2　·　en-ZA 2

## 女声（113）

| # | 音色 ID | 名称 | 地区 | 类型 | 状态 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `en-GB-Ada:DragonHDLatestNeural` | Ada Dragon HD Latest | en-GB | HD | GA |
| 2 | `en-GB-Sonia:DragonHDLatestNeural` | Sonia Dragon HD Latest | en-GB | HD | GA |
| 3 | `en-IN-Aarti:DragonHDLatestNeural` | Aarti Dragon HD Latest | en-IN | HD | GA |
| 4 | `en-IN-Diya:DragonHDLatestNeural` | Diya Dragon HD Latest | en-IN | HD | GA |
| 5 | `en-IN-Lavanya:DragonHDLatestNeural` | Lavanya Dragon HD Latest | en-IN | HD | GA |
| 6 | `en-IN-Meera:DragonHDLatestNeural` | Meera Dragon HD Latest | en-IN | HD | GA |
| 7 | `en-IN-Neerja:DragonHDLatestNeural` | Neerja Dragon HD Latest | en-IN | HD | GA |
| 8 | `en-US-Aria:DragonHDLatestNeural` | Aria Dragon HD Latest | en-US | HD | GA |
| 9 | `en-US-Ava:DragonHDLatestNeural` | Ava Dragon HD Latest | en-US | HD | GA |
| 10 | `en-US-Bree:DragonHDLatestNeural` | Bree Dragon HD Latest | en-US | HD | GA |
| 11 | `en-US-Emma:DragonHDLatestNeural` | Emma Dragon HD Latest | en-US | HD | GA |
| 12 | `en-US-Evelyn:DragonHDLatestNeural` | Evelyn Dragon HD Latest | en-US | HD | GA |
| 13 | `en-US-Jane:DragonHDLatestNeural` | Jane Dragon HD Latest | en-US | HD | GA |
| 14 | `en-US-Jenny:DragonHDLatestNeural` | Jenny Dragon HD Latest | en-US | HD | GA |
| 15 | `en-US-Mila:DragonHDLatestNeural` | Mila Dragon HD Latest | en-US | HD | GA |
| 16 | `en-US-Nova:DragonHDLatestNeural` | Nova Dragon HD Latest | en-US | HD | GA |
| 17 | `en-US-Phoebe:DragonHDLatestNeural` | Phoebe Dragon HD Latest | en-US | HD | GA |
| 18 | `en-US-Serena:DragonHDLatestNeural` | Serena Dragon HD Latest | en-US | HD | GA |
| 19 | `en-US-Tessa:DragonHDLatestNeural` | Tessa Dragon HD Latest | en-US | HD | GA |
| 20 | `en-US-Tiana:DragonHDLatestNeural` | Tiana Dragon HD Latest | en-US | HD | GA |
| 21 | `en-AU-AnnetteNeural` | Annette | en-AU | 标准 | GA |
| 22 | `en-AU-CarlyNeural` | Carly | en-AU | 标准 | GA |
| 23 | `en-AU-ElsieNeural` | Elsie | en-AU | 标准 | GA |
| 24 | `en-AU-FreyaNeural` | Freya | en-AU | 标准 | GA |
| 25 | `en-AU-JoanneNeural` | Joanne | en-AU | 标准 | GA |
| 26 | `en-AU-KimNeural` | Kim | en-AU | 标准 | GA |
| 27 | `en-AU-NatashaNeural` | Natasha | en-AU | 标准 | GA |
| 28 | `en-AU-TinaNeural` | Tina | en-AU | 标准 | GA |
| 29 | `en-CA-ClaraNeural` | Clara | en-CA | 标准 | GA |
| 30 | `en-GB-AbbiNeural` | Abbi | en-GB | 标准 | GA |
| 31 | `en-GB-AdaMultilingualNeural` | Ada Multilingual | en-GB | 多语种 | GA |
| 32 | `en-GB-BellaNeural` | Bella | en-GB | 标准 | GA |
| 33 | `en-GB-HollieNeural` | Hollie | en-GB | 标准 | GA |
| 34 | `en-GB-LibbyNeural` | Libby | en-GB | 标准 | GA |
| 35 | `en-GB-MaisieNeural` | Maisie | en-GB | 标准 | GA |
| 36 | `en-GB-OliviaNeural` | Olivia | en-GB | 标准 | GA |
| 37 | `en-GB-SoniaNeural` | Sonia | en-GB | 标准 | GA |
| 38 | `en-HK-YanNeural` | Yan | en-HK | 标准 | GA |
| 39 | `en-IE-EmilyNeural` | Emily | en-IE | 标准 | GA |
| 40 | `en-IN-AartiIndicNeural` | Aarti Indic | en-IN | 标准 | GA |
| 41 | `en-IN-AartiNeural` | Aarti | en-IN | 标准 | GA |
| 42 | `en-IN-AashiNeural` | Aashi | en-IN | 标准 | GA |
| 43 | `en-IN-AnanyaNeural` | Ananya | en-IN | 标准 | GA |
| 44 | `en-IN-KavyaNeural` | Kavya | en-IN | 标准 | GA |
| 45 | `en-IN-NeerjaIndicNeural` | Neerja Indic | en-IN | 多语种 | GA |
| 46 | `en-IN-NeerjaNeural` | Neerja | en-IN | 标准 | GA |
| 47 | `en-KE-AsiliaNeural` | Asilia | en-KE | 标准 | GA |
| 48 | `en-NG-EzinneNeural` | Ezinne | en-NG | 标准 | GA |
| 49 | `en-NZ-MollyNeural` | Molly | en-NZ | 标准 | GA |
| 50 | `en-PH-RosaNeural` | Rosa | en-PH | 标准 | GA |
| 51 | `en-SG-LunaNeural` | Luna | en-SG | 标准 | GA |
| 52 | `en-TZ-ImaniNeural` | Imani | en-TZ | 标准 | GA |
| 53 | `en-US-AIGenerate2Neural` | AIGenerate2 | en-US | 标准 | GA |
| 54 | `en-US-AmandaMultilingualNeural` | Amanda Multilingual | en-US | 多语种 | GA |
| 55 | `en-US-AmberNeural` | Amber | en-US | 标准 | GA |
| 56 | `en-US-AnaNeural` | Ana | en-US | 标准 | GA |
| 57 | `en-US-AriaNeural` | Aria | en-US | 标准 | GA |
| 58 | `en-US-AshleyNeural` | Ashley | en-US | 标准 | GA |
| 59 | `en-US-AvaMultilingualNeural` | Ava Multilingual | en-US | 多语种 | GA |
| 60 | `en-US-AvaNeural` | Ava | en-US | 标准 | GA |
| 61 | `en-US-CoraMultilingualNeural` | Cora Multilingual | en-US | 多语种 | GA |
| 62 | `en-US-CoraNeural` | Cora | en-US | 标准 | GA |
| 63 | `en-US-ElizabethNeural` | Elizabeth | en-US | 标准 | GA |
| 64 | `en-US-EmmaMultilingualNeural` | Emma Multilingual | en-US | 多语种 | GA |
| 65 | `en-US-EmmaNeural` | Emma | en-US | 标准 | GA |
| 66 | `en-US-EvelynMultilingualNeural` | Evelyn Multilingual | en-US | 多语种 | GA |
| 67 | `en-US-JaneNeural` | Jane | en-US | 标准 | GA |
| 68 | `en-US-JennyMultilingualNeural` | Jenny Multilingual | en-US | 多语种 | GA |
| 69 | `en-US-JennyNeural` | Jenny | en-US | 标准 | GA |
| 70 | `en-US-LolaMultilingualNeural` | Lola Multilingual | en-US | 多语种 | GA |
| 71 | `en-US-LunaNeural` | Luna | en-US | 标准 | GA |
| 72 | `en-US-MichelleNeural` | Michelle | en-US | 标准 | GA |
| 73 | `en-US-MonicaNeural` | Monica | en-US | 标准 | GA |
| 74 | `en-US-NancyMultilingualNeural` | Nancy Multilingual | en-US | 多语种 | GA |
| 75 | `en-US-NancyNeural` | Nancy | en-US | 标准 | GA |
| 76 | `en-US-NovaTurboMultilingualNeural` | Nova Turbo Multilingual | en-US | Turbo · 多语种 | GA |
| 77 | `en-US-PhoebeMultilingualNeural` | Phoebe Multilingual | en-US | 多语种 | GA |
| 78 | `en-US-SaraNeural` | Sara | en-US | 标准 | GA |
| 79 | `en-US-SerenaMultilingualNeural` | Serena Multilingual | en-US | 多语种 | GA |
| 80 | `en-US-ShimmerTurboMultilingualNeural` | Shimmer Turbo Multilingual | en-US | Turbo · 多语种 | GA |
| 81 | `en-US-Tiana:DragonHDFlashLatestNeural` | Tiana Dragon HD Flash Latest | en-US | HD-Flash | GA |
| 82 | `en-ZA-LeahNeural` | Leah | en-ZA | 标准 | GA |
| 83 | `en-au-cyanspark:DragonHDOmniLatestNeural` | Cyanspark Dragon HD Omni Latest | en-AU | HD-Omni | Preview |
| 84 | `en-AU-Isla:MAI-Voice-2` | Isla MAI-Voice-2 | en-AU | 标准 | Preview |
| 85 | `en-AU-Isla:MAI-Voice-2.1` | Isla MAI-Voice-2.1 | en-AU | 标准 | Preview |
| 86 | `en-au-siennatopaz:DragonHDOmniLatestNeural` | Siennatopaz Dragon HD Omni Latest | en-AU | HD-Omni | Preview |
| 87 | `en-IN-Priya:MAI-Voice-2.1` | Priya MAI-Voice-2.1 | en-IN | 标准 | Preview |
| 88 | `en-US-Ava-Preview:DragonHDLatestNeural` | Ava Preview Dragon HD Latest | en-US | HD | Preview |
| 89 | `en-us-ava:DragonHDOmniLatestNeural` | Ava Dragon HD Omni Latest | en-US | HD-Omni | Preview |
| 90 | `en-us-blushzephyr:DragonHDOmniLatestNeural` | Blushzephyr Dragon HD Omni Latest | en-US | HD-Omni | Preview |
| 91 | `en-US-Dana:DragonHDOmniLatestNeural` | Dana Dragon HD Omni Latest | en-US | HD-Omni | Preview |
| 92 | `en-us-emma:DragonHDOmniLatestNeural` | Emma Dragon HD Omni Latest | en-US | HD-Omni | Preview |
| 93 | `en-US-Harper:MAI-Voice-2` | Harper MAI-Voice-2 | en-US | 标准 | Preview |
| 94 | `en-US-Harper:MAI-Voice-2.1` | Harper MAI-Voice-2.1 | en-US | 标准 | Preview |
| 95 | `en-US-Iris:MAI-Voice-2` | Iris MAI-Voice-2 | en-US | 标准 | Preview |
| 96 | `en-US-Iris:MAI-Voice-2.1` | Iris MAI-Voice-2.1 | en-US | 标准 | Preview |
| 97 | `en-us-jelly:DragonHDOmniLatestNeural` | Jelly Dragon HD Omni Latest | en-US | HD-Omni | Preview |
| 98 | `en-US-Olivia:MAI-Voice-2` | Olivia MAI-Voice-2 | en-US | 标准 | Preview |
| 99 | `en-US-Olivia:MAI-Voice-2.1` | Olivia MAI-Voice-2.1 | en-US | 标准 | Preview |
| 100 | `en-US-Paige:DragonHDLatestNeural` | Paige Dragon HD Latest | en-US | HD | Preview |
| 101 | `en-US-Phoebe:DragonHDOmniLatestNeural` | Phoebe Dragon HD Omni Latest | en-US | HD-Omni | Preview |
| 102 | `en-US-Serena-Preview:DragonHDLatestNeural` | Serena Preview Dragon HD Latest | en-US | HD | Preview |
| 103 | `en-AU-Isla:MAI-Voice-2-Flash` | Isla MAI-Voice-2-Flash | en-AU | 标准 | Preview |
| 104 | `en-AU-Isla:MAI-Voice-2.1-Flash` | Isla MAI-Voice-2.1-Flash | en-AU | 标准 | Preview |
| 105 | `en-GB-MiaNeural` | Mia | en-GB | 标准 | Deprecated |
| 106 | `en-IN-Priya:MAI-Voice-2.1-Flash` | Priya MAI-Voice-2.1-Flash | en-IN | 标准 | Preview |
| 107 | `en-US-Ava:DragonLatestNeural` | Ava Dragon Latest | en-US | 标准 | Preview |
| 108 | `en-US-Harper:MAI-Voice-2-Flash` | Harper MAI-Voice-2-Flash | en-US | 标准 | Preview |
| 109 | `en-US-Harper:MAI-Voice-2.1-Flash` | Harper MAI-Voice-2.1-Flash | en-US | 标准 | Preview |
| 110 | `en-US-Iris:MAI-Voice-2-Flash` | Iris MAI-Voice-2-Flash | en-US | 标准 | Preview |
| 111 | `en-US-Iris:MAI-Voice-2.1-Flash` | Iris MAI-Voice-2.1-Flash | en-US | 标准 | Preview |
| 112 | `en-US-Olivia:MAI-Voice-2-Flash` | Olivia MAI-Voice-2-Flash | en-US | 标准 | Preview |
| 113 | `en-US-Olivia:MAI-Voice-2.1-Flash` | Olivia MAI-Voice-2.1-Flash | en-US | 标准 | Preview |

## 男声（99）

| # | 音色 ID | 名称 | 地区 | 类型 | 状态 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `en-GB-Ollie:DragonHDLatestNeural` | Ollie Dragon HD Latest | en-GB | HD | GA |
| 2 | `en-GB-Ryan:DragonHDLatestNeural` | Ryan Dragon HD Latest | en-GB | HD | GA |
| 3 | `en-IN-Arjun:DragonHDLatestNeural` | Arjun Dragon HD Latest | en-IN | HD | GA |
| 4 | `en-US-Adam:DragonHDLatestNeural` | Adam Dragon HD Latest | en-US | HD | GA |
| 5 | `en-US-Alloy:DragonHDLatestNeural` | Alloy Dragon HD Latest | en-US | HD | GA |
| 6 | `en-US-Andrew:DragonHDLatestNeural` | Andrew Dragon HD Latest | en-US | HD | GA |
| 7 | `en-US-Brian:DragonHDLatestNeural` | Brian Dragon HD Latest | en-US | HD | GA |
| 8 | `en-US-Davis:DragonHDLatestNeural` | Davis Dragon HD Latest | en-US | HD | GA |
| 9 | `en-US-Jimmie:DragonHDLatestNeural` | Jimmie Dragon HD Latest | en-US | HD | GA |
| 10 | `en-US-Juno:DragonHDLatestNeural` | Juno Dragon HD Latest | en-US | HD | GA |
| 11 | `en-US-Steffan:DragonHDLatestNeural` | Steffan Dragon HD Latest | en-US | HD | GA |
| 12 | `en-US-Tyler:DragonHDLatestNeural` | Tyler Dragon HD Latest | en-US | HD | GA |
| 13 | `en-US-Vance:DragonHDLatestNeural` | Vance Dragon HD Latest | en-US | HD | GA |
| 14 | `en-AU-DarrenNeural` | Darren | en-AU | 标准 | GA |
| 15 | `en-AU-DuncanNeural` | Duncan | en-AU | 标准 | GA |
| 16 | `en-AU-KenNeural` | Ken | en-AU | 标准 | GA |
| 17 | `en-AU-NeilNeural` | Neil | en-AU | 标准 | GA |
| 18 | `en-AU-TimNeural` | Tim | en-AU | 标准 | GA |
| 19 | `en-AU-WilliamMultilingualNeural` | William Multilingual | en-AU | 多语种 | GA |
| 20 | `en-AU-WilliamNeural` | William | en-AU | 标准 | GA |
| 21 | `en-CA-LiamNeural` | Liam | en-CA | 标准 | GA |
| 22 | `en-GB-AlfieNeural` | Alfie | en-GB | 标准 | GA |
| 23 | `en-GB-ElliotNeural` | Elliot | en-GB | 标准 | GA |
| 24 | `en-GB-EthanNeural` | Ethan | en-GB | 标准 | GA |
| 25 | `en-GB-NoahNeural` | Noah | en-GB | 标准 | GA |
| 26 | `en-GB-OliverNeural` | Oliver | en-GB | 标准 | GA |
| 27 | `en-GB-OllieMultilingualNeural` | Ollie Multilingual | en-GB | 多语种 | GA |
| 28 | `en-GB-RyanNeural` | Ryan | en-GB | 标准 | GA |
| 29 | `en-GB-ThomasNeural` | Thomas | en-GB | 标准 | GA |
| 30 | `en-HK-SamNeural` | Sam | en-HK | 标准 | GA |
| 31 | `en-IE-ConnorNeural` | Connor | en-IE | 标准 | GA |
| 32 | `en-IN-AaravNeural` | Aarav | en-IN | 标准 | GA |
| 33 | `en-IN-ArjunIndicNeural` | Arjun Indic | en-IN | 多语种 | GA |
| 34 | `en-IN-ArjunNeural` | Arjun | en-IN | 标准 | GA |
| 35 | `en-IN-KunalNeural` | Kunal | en-IN | 标准 | GA |
| 36 | `en-IN-PrabhatIndicNeural` | Prabhat Indic | en-IN | 多语种 | GA |
| 37 | `en-IN-PrabhatNeural` | Prabhat | en-IN | 标准 | GA |
| 38 | `en-IN-RehaanNeural` | Rehaan | en-IN | 标准 | GA |
| 39 | `en-KE-ChilembaNeural` | Chilemba | en-KE | 标准 | GA |
| 40 | `en-NG-AbeoNeural` | Abeo | en-NG | 标准 | GA |
| 41 | `en-NZ-MitchellNeural` | Mitchell | en-NZ | 标准 | GA |
| 42 | `en-PH-JamesNeural` | James | en-PH | 标准 | GA |
| 43 | `en-SG-WayneNeural` | Wayne | en-SG | 标准 | GA |
| 44 | `en-TZ-ElimuNeural` | Elimu | en-TZ | 标准 | GA |
| 45 | `en-US-AdamMultilingualNeural` | Adam Multilingual | en-US | 多语种 | GA |
| 46 | `en-US-AIGenerate1Neural` | AIGenerate1 | en-US | 标准 | GA |
| 47 | `en-US-AlloyTurboMultilingualNeural` | Alloy Turbo Multilingual | en-US | Turbo · 多语种 | GA |
| 48 | `en-US-AndrewMultilingualNeural` | Andrew Multilingual | en-US | 多语种 | GA |
| 49 | `en-US-AndrewNeural` | Andrew | en-US | 标准 | GA |
| 50 | `en-US-BrandonMultilingualNeural` | Brandon Multilingual | en-US | 多语种 | GA |
| 51 | `en-US-BrandonNeural` | Brandon | en-US | 标准 | GA |
| 52 | `en-US-BrianMultilingualNeural` | Brian Multilingual | en-US | 多语种 | GA |
| 53 | `en-US-BrianNeural` | Brian | en-US | 标准 | GA |
| 54 | `en-US-ChristopherMultilingualNeural` | Christopher Multilingual | en-US | 多语种 | GA |
| 55 | `en-US-ChristopherNeural` | Christopher | en-US | 标准 | GA |
| 56 | `en-US-DavisMultilingualNeural` | Davis Multilingual | en-US | 多语种 | GA |
| 57 | `en-US-DavisNeural` | Davis | en-US | 标准 | GA |
| 58 | `en-US-DerekMultilingualNeural` | Derek Multilingual | en-US | 多语种 | GA |
| 59 | `en-US-DustinMultilingualNeural` | Dustin Multilingual | en-US | 多语种 | GA |
| 60 | `en-US-EchoTurboMultilingualNeural` | Echo Turbo Multilingual | en-US | Turbo · 多语种 | GA |
| 61 | `en-US-EricNeural` | Eric | en-US | 标准 | GA |
| 62 | `en-US-GuyNeural` | Guy | en-US | 标准 | GA |
| 63 | `en-US-JacobNeural` | Jacob | en-US | 标准 | GA |
| 64 | `en-US-JasonNeural` | Jason | en-US | 标准 | GA |
| 65 | `en-US-Jimmie:DragonHDFlashLatestNeural` | Jimmie Dragon HD Flash Latest | en-US | HD-Flash | GA |
| 66 | `en-US-KaiNeural` | Kai | en-US | 标准 | GA |
| 67 | `en-US-LewisMultilingualNeural` | Lewis Multilingual | en-US | 多语种 | GA |
| 68 | `en-US-OnyxTurboMultilingualNeural` | Onyx Turbo Multilingual | en-US | Turbo · 多语种 | GA |
| 69 | `en-US-RogerNeural` | Roger | en-US | 标准 | GA |
| 70 | `en-US-RyanMultilingualNeural` | Ryan Multilingual | en-US | 多语种 | GA |
| 71 | `en-US-SamuelMultilingualNeural` | Samuel Multilingual | en-US | 多语种 | GA |
| 72 | `en-US-SteffanMultilingualNeural` | Steffan Multilingual | en-US | 多语种 | GA |
| 73 | `en-US-SteffanNeural` | Steffan | en-US | 标准 | GA |
| 74 | `en-US-TonyNeural` | Tony | en-US | 标准 | GA |
| 75 | `en-US-Tyler:DragonHDFlashLatestNeural` | Tyler Dragon HD Flash Latest | en-US | HD-Flash | GA |
| 76 | `en-ZA-LukeNeural` | Luke | en-ZA | 标准 | GA |
| 77 | `en-IN-Dhruv:MAI-Voice-2.1` | Dhruv MAI-Voice-2.1 | en-IN | 标准 | Preview |
| 78 | `en-US-Andrew-Preview:DragonHDLatestNeural` | Andrew Preview Dragon HD Latest | en-US | HD | Preview |
| 79 | `en-US-Andrew:DragonHDOmniLatestNeural` | Andrew Dragon HD Omni Latest | en-US | HD-Omni | Preview |
| 80 | `en-US-Brian:DragonHDOmniLatestNeural` | Brian Dragon HD Omni Latest | en-US | HD-Omni | Preview |
| 81 | `en-US-Caleb:DragonHDOmniLatestNeural` | Caleb Dragon HD Omni Latest | en-US | HD-Omni | Preview |
| 82 | `en-US-Colin:DragonHDLatestNeural` | Colin Dragon HD Latest | en-US | HD | Preview |
| 83 | `en-US-Ethan:MAI-Voice-2` | Ethan MAI-Voice-2 | en-US | 标准 | Preview |
| 84 | `en-US-Ethan:MAI-Voice-2.1` | Ethan MAI-Voice-2.1 | en-US | 标准 | Preview |
| 85 | `en-us-goldenspark:DragonHDOmniLatestNeural` | Goldenspark Dragon HD Omni Latest | en-US | HD-Omni | Preview |
| 86 | `en-US-Grant:MAI-Voice-2` | Grant MAI-Voice-2 | en-US | 标准 | Preview |
| 87 | `en-US-Grant:MAI-Voice-2.1` | Grant MAI-Voice-2.1 | en-US | 标准 | Preview |
| 88 | `en-US-Jasper:MAI-Voice-2` | Jasper MAI-Voice-2 | en-US | 标准 | Preview |
| 89 | `en-US-Jasper:MAI-Voice-2.1` | Jasper MAI-Voice-2.1 | en-US | 标准 | Preview |
| 90 | `en-US-Lewis:DragonHDOmniLatestNeural` | Lewis Dragon HD Omni Latest | en-US | HD-Omni | Preview |
| 91 | `en-IN-Dhruv:MAI-Voice-2.1-Flash` | Dhruv MAI-Voice-2.1-Flash | en-IN | 标准 | Preview |
| 92 | `en-US-Andrew:DragonLatestNeural` | Andrew Dragon Latest | en-US | 标准 | Preview |
| 93 | `en-US-AshTurboMultilingualNeural` | Ash Turbo Multilingual | en-US | Turbo · 多语种 | Preview |
| 94 | `en-US-Ethan:MAI-Voice-2-Flash` | Ethan MAI-Voice-2-Flash | en-US | 标准 | Preview |
| 95 | `en-US-Ethan:MAI-Voice-2.1-Flash` | Ethan MAI-Voice-2.1-Flash | en-US | 标准 | Preview |
| 96 | `en-US-Grant:MAI-Voice-2-Flash` | Grant MAI-Voice-2-Flash | en-US | 标准 | Preview |
| 97 | `en-US-Grant:MAI-Voice-2.1-Flash` | Grant MAI-Voice-2.1-Flash | en-US | 标准 | Preview |
| 98 | `en-US-Jasper:MAI-Voice-2-Flash` | Jasper MAI-Voice-2-Flash | en-US | 标准 | Preview |
| 99 | `en-US-Jasper:MAI-Voice-2.1-Flash` | Jasper MAI-Voice-2.1-Flash | en-US | 标准 | Preview |

## 中性 / 多说话人（9）

| # | 音色 ID | 名称 | 地区 | 类型 | 状态 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `en-US-FableTurboMultilingualNeural` | Fable Turbo Multilingual | en-US | Turbo · 多语种 | GA |
| 2 | `en-GB-Emily:MAI-Voice-2.1` | Emily MAI-Voice-2.1 | en-GB | 标准 | Preview |
| 3 | `en-GB-Harry:MAI-Voice-2.1` | Harry MAI-Voice-2.1 | en-GB | 标准 | Preview |
| 4 | `en-Multitalker:DragonHDLatestNeural` | English Multitalker Dragon HD Latest | en-US | HD | Preview |
| 5 | `en-US-Sage:MAI-Voice-2.1` | Sage MAI-Voice-2.1 | en-US | 标准 | Preview |
| 6 | `en-GB-Emily:MAI-Voice-2.1-Flash` | Emily MAI-Voice-2.1-Flash | en-GB | 标准 | Preview |
| 7 | `en-GB-Harry:MAI-Voice-2.1-Flash` | Harry MAI-Voice-2.1-Flash | en-GB | 标准 | Preview |
| 8 | `en-US-BlueNeural` | Blue | en-US | 标准 | Preview |
| 9 | `en-US-Sage:MAI-Voice-2.1-Flash` | Sage MAI-Voice-2.1-Flash | en-US | 标准 | Preview |

# 日语（10）

地区分布：ja-JP 10

## 女声（5）

| # | 音色 ID | 名称 | 地区 | 类型 | 状态 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `ja-JP-Nanami:DragonHDLatestNeural` | Nanami Dragon HD Latest | ja-JP | HD | GA |
| 2 | `ja-JP-AoiNeural` | 碧衣 | ja-JP | 标准 | GA |
| 3 | `ja-JP-MayuNeural` | 真夕 | ja-JP | 标准 | GA |
| 4 | `ja-JP-NanamiNeural` | 七海 | ja-JP | 标准 | GA |
| 5 | `ja-JP-ShioriNeural` | 志織 | ja-JP | 标准 | GA |

## 男声（5）

| # | 音色 ID | 名称 | 地区 | 类型 | 状态 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `ja-JP-Masaru:DragonHDLatestNeural` | Masaru Dragon HD Latest | ja-JP | HD | GA |
| 2 | `ja-JP-DaichiNeural` | 大智 | ja-JP | 标准 | GA |
| 3 | `ja-JP-KeitaNeural` | 圭太 | ja-JP | 标准 | GA |
| 4 | `ja-JP-NaokiNeural` | 直紀 | ja-JP | 标准 | GA |
| 5 | `ja-JP-MasaruMultilingualNeural` | 勝 多言語 | ja-JP | 多语种 | Preview |

# 韩语（24）

地区分布：ko-KR 24

## 女声（12）

| # | 音色 ID | 名称 | 地区 | 类型 | 状态 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `ko-KR-SunHi:DragonHDLatestNeural` | SunHi Dragon HD Latest | ko-KR | HD | GA |
| 2 | `ko-KR-JiMinNeural` | 지민 | ko-KR | 标准 | GA |
| 3 | `ko-KR-SeoHyeonNeural` | 서현 | ko-KR | 标准 | GA |
| 4 | `ko-KR-SoonBokNeural` | 순복 | ko-KR | 标准 | GA |
| 5 | `ko-KR-SunHiNeural` | 선히 | ko-KR | 标准 | GA |
| 6 | `ko-KR-YuJinNeural` | 유진 | ko-KR | 标准 | GA |
| 7 | `ko-KR-Haena:MAI-Voice-2` | Haena MAI-Voice-2 | ko-KR | 标准 | Preview |
| 8 | `ko-KR-Haena:MAI-Voice-2.1` | Haena MAI-Voice-2.1 | ko-KR | 标准 | Preview |
| 9 | `ko-KR-Harper:MAI-Voice-2.1` | Harper MAI-Voice-2.1 | ko-KR | 标准 | Preview |
| 10 | `ko-KR-Haena:MAI-Voice-2-Flash` | Haena MAI-Voice-2-Flash | ko-KR | 标准 | Preview |
| 11 | `ko-KR-Haena:MAI-Voice-2.1-Flash` | Haena MAI-Voice-2.1-Flash | ko-KR | 标准 | Preview |
| 12 | `ko-KR-Harper:MAI-Voice-2.1-Flash` | Harper MAI-Voice-2.1-Flash | ko-KR | 标准 | Preview |

## 男声（12）

| # | 音色 ID | 名称 | 地区 | 类型 | 状态 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `ko-KR-Hyunsu:DragonHDLatestNeural` | Hyunsu Dragon HD Latest | ko-KR | HD | GA |
| 2 | `ko-KR-BongJinNeural` | 봉진 | ko-KR | 标准 | GA |
| 3 | `ko-KR-GookMinNeural` | 국민 | ko-KR | 标准 | GA |
| 4 | `ko-KR-HyunsuMultilingualNeural` | Hyunsu Multilingual | ko-KR | 多语种 | GA |
| 5 | `ko-KR-HyunsuNeural` | 현수 | ko-KR | 标准 | GA |
| 6 | `ko-KR-InJoonNeural` | 인준 | ko-KR | 标准 | GA |
| 7 | `ko-KR-Grant:MAI-Voice-2.1` | Grant MAI-Voice-2.1 | ko-KR | 标准 | Preview |
| 8 | `ko-KR-Junho:MAI-Voice-2` | Junho MAI-Voice-2 | ko-KR | 标准 | Preview |
| 9 | `ko-KR-Junho:MAI-Voice-2.1` | Junho MAI-Voice-2.1 | ko-KR | 标准 | Preview |
| 10 | `ko-KR-Grant:MAI-Voice-2.1-Flash` | Grant MAI-Voice-2.1-Flash | ko-KR | 标准 | Preview |
| 11 | `ko-KR-Junho:MAI-Voice-2-Flash` | Junho MAI-Voice-2-Flash | ko-KR | 标准 | Preview |
| 12 | `ko-KR-Junho:MAI-Voice-2.1-Flash` | Junho MAI-Voice-2.1-Flash | ko-KR | 标准 | Preview |

# 速选建议

| 场景 | 音色 ID | 存在 |
| --- | --- | :---: |
| 中文女 · 朗读主用 | `zh-CN-Xiaoxiao:DragonHDFlashLatestNeural` | ✅ |
| 中文女 · 中英混排 | `zh-CN-XiaoxiaoMultilingualNeural` | ✅ |
| 中文男 · 朗读 | `zh-CN-Yunxi:DragonHDFlashLatestNeural` | ✅ |
| 中文男 · 沉稳 | `zh-CN-YunjianNeural` | ✅ |
| 英文女 · 例句朗读 | `en-US-AvaMultilingualNeural` | ✅ |
| 英文女 · 多语种 | `en-US-EmmaMultilingualNeural` | ✅ |
| 英文男 · 例句朗读 | `en-US-AndrewMultilingualNeural` | ✅ |
| 日语女 | `ja-JP-NanamiNeural` | ✅ |
| 韩语女 | `ko-KR-SunHiNeural` | ✅ |
