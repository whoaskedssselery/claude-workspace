[🇬🇧 English](README.md) · 🇷🇺 Русский

# Claude Workspace

[![CI](https://github.com/whoaskedssselery/claude-workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/whoaskedssselery/claude-workspace/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Одной командой готовит проект к работе с Claude Code: подбирает набор скиллов, создаёт манифест
воркспейса и файл `CLAUDE.md`. Подбор идёт под *способ работы* — обучение, продовый проект,
задание, редизайн — а не под конкретный стек.

## Установка и запуск

```bash
npm install -g claude-workspace    # или: pnpm add -g / yarn global add / bun add -g
claude-workspace init
```

`init` без аргументов запускает интерактивный визард — выбираешь пресет, дополнительные скиллы,
подтверждаешь. Это основной способ пользоваться инструментом. Не хочешь ставить глобально? У
каждого пакетного менеджера есть форма запуска без установки:

```bash
npx claude-workspace init          # npm
pnpm dlx claude-workspace init     # pnpm
yarn dlx claude-workspace init     # yarn
bunx claude-workspace init         # bun
```

Если `pnpm add -g claude-workspace` (даже с `@latest`) ставит версию старее той, что реально на npm
— это встроенная политика pnpm `minimumReleaseAge`, которая нарочно придерживает совсем свежую
публикацию (защита supply-chain по умолчанию, не баг пакета). `pnpm add -g
claude-workspace@<точная-версия>` обходит это ограничение сразу для этой версии, либо просто
подожди — `@latest` подхватит её сам, как только она "отлежится".

Уже знаешь, что нужно (CI, автоматизация, повторная настройка)? Пропусти визард, передав имя
пресета сразу:

```bash
claude-workspace init <preset>
```

### Что появляется в проекте

- `.claude/skills/` — скиллы выбранного пресета, готовы к тому, что Claude Code обратится к ним,
  когда задача совпадёт с одним из них
- `.claude/workspace.yaml` — манифест того, что установлено; его читают `sync`/`doctor`/`add`/`remove`
- `CLAUDE.md` — сгенерированная точка входа для проекта (если файл уже есть — не трогается),
  которая перечисляет каждый установленный скилл рядом с его однострочным описанием — чтобы "когда
  это использовать" было видно прямо в контексте ещё до того, как кто-то решит открыть файл скилла
  — и явно говорит Claude комбинировать все подходящие скиллы на одной задаче, а не
  останавливаться на первом совпадении, что и есть самая частая причина, по которой setup с
  несколькими скиллами используется не полностью
- небольшой помеченный блок в `.gitignore` для единственной по-настоящему личной вещи:
  `.claude/settings.local.json` и `.DS_Store`

Всё остальное (`.claude/skills/`, `.claude/workspace.yaml`, `CLAUDE.md`) специально не игнорируется
— это и есть смысл инструмента, эти файлы коммитятся и расшариваются на команду.

## Пресеты

Пресет — это *способ работы*, а не стек: ни один из них не заточен конкретно под React или бэкенд.
Выбираешь пресет под свою ситуацию, а нужную технологию добавляешь через `--with=` (см. ниже).

| Пресет | Что делает | Когда использовать |
|---|---|---|
| `learning` | [learning-guard](skills/core/learning-guard/SKILL.md) + [teacher](skills/core/teacher/SKILL.md): код пишет человек, Claude учит и проверяет, а не пишет за тебя. | Изучение технологии. Добавь стек через `--with=`, например `--with=react-best-practices`. |
| `project` | Обычная работа без ограничений, плюс [health-review](skills/core/health-review/SKILL.md) и [commit-discipline](skills/core/commit-discipline/SKILL.md). | Повседневная работа над реальным проектом. Добавь `--with=spike` для конкретной одноразовой/исследовательской задачи. |
| `assignment` | [assignment-mode](skills/core/assignment-mode/SKILL.md): Claude может написать решение сам, но проверяет, что оно реально работает, и не выходит за рамки условия. | Учебные задания, тестовые, оцениваемые работы. Добавь `--with=assignment-defend`, если работу нужно будет защищать перед преподавателем. |
| `redesign` | Убирает учебные ограничения, добавляет `react-best-practices`. | Визуальная/UI-работа. Добавь `--with=claude-design` для структурированной работы над дизайн-артефактами. |
| `oss-contribution` | Минимальные, соответствующие конвенциям репозитория дифф-патчи. | Вклад в чужой репозиторий. |
| `debug` | [debug-mode](skills/core/debug-mode/SKILL.md): заставляет пройти reproduce → isolate → diagnose → fix в этом порядке, вместо угадывания методом проб и ошибок. | Охота на реальный баг, особенно если он уже пережил сессию-другую "поменял — перезапустил — не помогло". |

Каждый пресет также включает [codegraph](skills/core/codegraph/SKILL.md) (быстрая навигация по
коду) и `commit-discipline`.

## Добавление всего остального через `--with=`

`--with=<name,name,...>` добавляет к пресету что угодно ещё: скилл под конкретную технологию,
вариант формата работы или внешний инструмент — через запятую, сколько угодно за раз.

```bash
claude-workspace init learning . --with=react-best-practices
claude-workspace init learning . --with=api-designer,security-reviewer,database-optimizer
claude-workspace init assignment . --with=assignment-defend
claude-workspace init project . --with=spike
```

Команда `claude-workspace list` покажет все пресеты, скиллы и внешние инструменты, которые знает
пакет, сгруппированные по домену (`frontend/`, `backend/`, `design/`, ...) с однострочным описанием
каждого — каталог достаточно большой, проще посмотреть список, чем листать репозиторий. Опечатка в
имени не проходит молча — предлагается ближайшее совпадение:

```
! "databse-optimizer" isn't a known skill or external tool — skipped (did you mean "database-optimizer"?)
```

### Откуда реально берутся файлы скилла

В самом репозитории лежат только `skills/core/` (собственные поведенческие скиллы этого проекта) и
`skills/formats/` (небольшие, тоже оригинальные варианты вроде `spike`/`assignment-defend`). Каждый
скилл под конкретную технологию в каталоге (`react-expert`, `api-designer`,
`kubernetes-specialist`, ...) при первом выборе скачивается из репозитория своего автора — тот же
механизм, что и [`add <url>`](#добавление-скилла-из-любого-репозитория) ниже, просто заранее
привязанный к нужному источнику — а скачанная копия вместе с источником записывается в
`workspace.yaml`, чтобы `sync`/`doctor`/`remove` тоже знали о ней. Смотри [Атрибуцию](#атрибуция) —
там точно указано, из какого репозитория взят каждый скилл.

Несколько имён в каталоге (`impeccable`, `superpowers`, `taste`, `ui-ux-pro-max`) — это вообще не
файлы скиллов, а отдельные инструменты со своим установщиком или маркетплейсом плагинов. `init`
никогда не ставит их автоматически — по умолчанию просто печатает команду установки. Добавь
`--with=<name>`, чтобы реально запустить установщик этого инструмента, или `--with-external`, чтобы
поставить сразу все внешние инструменты, которые перечисляет выбранный пресет.

## Добавление скилла из любого репозитория

```bash
claude-workspace add vercel-labs/agent-skills
claude-workspace add https://github.com/owner/repo/tree/main/skills/some-skill
```

Не ограничено собственным каталогом пакета — передавай URL, git-remote или сокращение
`owner/repo`, и скилл будет скачан через [`npx skills`](https://github.com/vercel-labs/skills)
прямо в `.claude/skills/`, а затем записан в `workspace.yaml`, чтобы `sync`/`doctor`/`remove` тоже
знали о нём. Добавь `--global`, чтобы установить в `~/.claude/skills/` вместо этого — станет
доступен во всех проектах на машине, но не привязан (и не записан) ни к одному конкретному.

## Управление уже настроенным воркспейсом

```bash
claude-workspace doctor            # всё установлено и актуально?
claude-workspace add <name...>     # добавить скиллы/инструменты к уже установленным
claude-workspace remove <name...>  # убрать скиллы/инструменты
claude-workspace sync              # перекопировать содержимое скиллов после обновления пакета
claude-workspace hide              # временно убрать всё, что добавил claude-workspace
claude-workspace unhide            # вернуть всё обратно, как было
claude-workspace update            # обновить сам пакет, затем sync
```

`doctor` для каждого установленного скилла показывает: **ok**, **outdated** (содержимое разошлось,
нужен `sync`) или **missing** — плюс совпадает ли записанная версия тулкита с текущей и настроены
ли корректно `CLAUDE.md`/`.gitignore`.

`sync` перекопирует всё, что объявлено в `.claude/workspace.yaml`, из текущей установленной версии
пакета — запускай после обновления `claude-workspace`, чтобы подтянуть изменения в содержимом
скиллов. Также обновляет удалённые (`add <url>`) скиллы и блок в `CLAUDE.md`, но не трогает внешние
инструменты (их обновляй их собственным CLI).

Сгенерированная часть `CLAUDE.md` находится внутри помеченного блока
(`<!-- claude-workspace:start/end -->`) — `sync` обновляет только то, что внутри меток, всё
написанное снаружи не трогается никогда.

### Временно спрятать воркспейс

```bash
claude-workspace hide     # спрятать .claude/skills/, workspace.yaml и блок в CLAUDE.md
claude-workspace unhide   # вернуть всё обратно, точно как было
```

`hide` перемещает всё, что claude-workspace добавил в проект — `.claude/skills/`,
`.claude/workspace.yaml`, сгенерированный блок в `CLAUDE.md`, и собственные дополнительные пути
каждого установленного сейчас скилла/инструмента (например `.impeccable/` от impeccable,
`.codegraph/` от codegraph, `product-facts.md`/`brand-spec.md` от claude-design) — в тайник
**полностью за пределами проекта** (в `~/.claude-workspace/hidden/`, по ключу от пути проекта), так
что проект выглядит так, будто `init` никогда не запускался, и в дереве проекта (или в `git
status`) не остаётся вообще ничего — запись в `.gitignore` прячет папку только от git, а не от IDE,
поэтому тайник и не живёт внутри проекта.

То, какие пути принадлежат какому скиллу/инструменту, объявлено прямо там, где определён сам
скилл/инструмент — во фронтматтере `SKILL.md` core- или format-скилла (`creates:`), или рядом с
записью в `REMOTE_SKILLS`/`EXTERNAL_TOOLS` — а не в отдельном списке, который `hide` проверял бы
безусловно в каждом проекте вне зависимости от того, актуально это или нет. `hide` забирает
дополнительные пути только для тех имён, которые реально записаны в `workspace.yaml` *этого*
проекта — то есть разворачивает именно то, что добавил сам claude-workspace: инструмент,
установленный вручную в обход claude-workspace (не через `init`/`add`/`--with-external`), вне
области действия по той же логике — раз его никто не записал, искать для него пути неоткуда.

Для всего, о чём `hide` не может узнать сам — инструмент, настроенный вручную, личная заметка,
локальный файл, который просто не должен быть виден во время скриншеринга — впишите его сами в
`.claude-workspace/hide.yaml`:

```yaml
paths:
  - .env.local
  - notes/
```

Необязательно, и коммитится как кастомный пресет, так что после клонирования у всей команды будет
одинаковое поведение `hide`. Каждый путь — относительно корня проекта; всё, что вело бы за пределы
проекта (`..`, абсолютный путь), пропускается с предупреждением, а не перемещается.

Полезно для скриншеринга, чистого `git diff` или передачи проекта тому, кто не должен это видеть,
— при этом ничего не теряется. `.gitignore` не трогается вообще, и всё работает одинаково
независимо от того, установлен ли сам `claude-workspace` глобально или только в этом одном
проекте.

`unhide` — это разворот, но не sync: он восстанавливает точный снимок состояния до `hide`, а не
сливает то, что изменилось, пока было спрятано. Повторный `hide` без `unhide` между ними (или
`unhide`, когда прятать нечего) завершится ошибкой, а не тихо сделает что-то неожиданное.

`claude-workspace version` печатает установленную версию и, как у npm, проверяет тег `latest` на
npm — если есть версия новее, скажет об этом. Best-effort: таймаут ~2.5с, никогда не роняет и не
подвешивает команду, если с сетью что-то не так.

## Полный список команд

```bash
claude-workspace init                                        (интерактивный визард, нужен TTY)
claude-workspace init <preset> [targetDir] [--with-external] [--with=<name,...>] [--force]
claude-workspace list [--installed | --global] [targetDir]
claude-workspace sync [targetDir]
claude-workspace add <name...> [--global] [--skill=<name>]
claude-workspace remove <name...> [--global]
claude-workspace doctor [targetDir]
claude-workspace hide [targetDir]
claude-workspace unhide [targetDir]
claude-workspace update [targetDir]
claude-workspace version
```

`--force` (у `init`) вливает блок `claude-workspace` в уже существующий `CLAUDE.md`, у которого
такого блока ещё нет, вместо того чтобы оставить файл нетронутым.

`--skill=<name>` (у `add`) закрепляет один конкретный скилл из репозитория с несколькими скиллами —
без этого флага голый `owner/repo` установит все скиллы репозитория разом.

`claude-workspace --help` печатает этот же список команд с полным описанием флагов.

## Интерактивный визард

Запусти `init` без имени пресета в обычном терминале:

```bash
claude-workspace init
```

Визард проводит по тем же решениям пошагово: **язык** (русский/английский, запоминается после
первого запуска) → **пресет** (встроенный, ранее сохранённый свой, или собрать новый прямо сейчас)
→ **дополнительные скиллы** (чекбокс-список, сгруппированный по домену — frontend/, backend/,
design/... — в каждой группе вперемешку скиллы каталога и внешние инструменты с однострочной
подсказкой, плюс подходящие варианты формата) → подтверждение и установка.

**Управление с клавиатуры:** стрелки или `j`/`k` — перемещение, `space` — переключить пункт, цифры
`1`-`9` — перейти к пункту (и переключить его в чекбоксе), `a`/`n` — выбрать все/снять всё,
`enter` — подтвердить, `esc`/`Ctrl+C` — отменить без каких-либо изменений.

Нужен настоящий TTY (ввод с клавиатуры в raw-режиме) — запуск из скрипта, CI или с stdin из файла
вместо визарда выдаст понятную ошибку с просьбой передать имя пресета явно.

## Свои пресеты

При сборке своего пресета в визарде спросит, куда его сохранить:

- `.claude-workspace/presets/<name>.yaml` в текущем проекте — закоммить, и после клона у всей
  команды `claude-workspace init <name>` заработает сразу, без настройки на каждой машине.
- `~/.claude-workspace/presets/<name>.yaml` — личный, доступен в любом проекте на этой машине.

Можно также написать пресет вручную, в том же формате, что и встроенные — см.
[`presets/`](presets/). Оба варианта работают с `init`/`list` точно так же, как встроенный пресет.
При совпадении имён встроенный пресет всегда побеждает; локальный (в проекте) — побеждает
одноимённый глобальный.

## Структура проекта

```
scripts/workspace.js     точка входа CLI — только разбор аргументов и текст --help
scripts/lib/catalog.js   что поставляет пакет: пресеты, скиллы, внешние инструменты, парсер YAML
scripts/lib/manifest.js  установленный воркспейс проекта: workspace.yaml, CLAUDE.md, .gitignore
scripts/lib/remote.js    скачивание скилла из произвольного репозитория (`add <url>`)
scripts/lib/pm.js        определение пакетного менеджера / npx-dlx, используется в `update`
scripts/lib/commands.js  реализация команд, построена на четырёх файлах выше
scripts/lib/wizard.js    интерактивный визард `init` (подгружается только при реальном вызове)
scripts/lib/i18n.js      переведённые строки для визарда
scripts/lib/prompt.js    движок интерактивных промптов со стрелками
scripts/lib/colors.js    хелперы для ANSI-стилизации
scripts/lib/log.js       общие хелперы для warn/log в консоль

presets/    определения встроенных пресетов (.yaml)
skills/     только то, что оригинально для этого проекта: skills/core/<имя>/SKILL.md (поведение,
            во всех пресетах) и skills/formats/<имя>/SKILL.md (опциональные варианты, напр. spike).
            Всё остальное в каталоге (REMOTE_SKILLS в catalog.js) скачивается из чужого репозитория.
templates/  шаблоны CLAUDE.md и workspace.yaml, используются при генерации файлов проекта
test/       набор тестов (встроенный тест-раннер Node)
```

`scripts/workspace.js` реэкспортирует всё из `scripts/lib/`, поэтому `wizard.js` и тесты
импортируют всё из одного знакомого пути независимо от того, в каком файле это реально лежит.

## Локальная разработка

```bash
npm pack                        # соберёт claude-workspace-<version>.tgz
cd /path/to/some/test-project
npx -p /absolute/path/to/claude-workspace-<version>.tgz claude-workspace init learning .
```

Замечено, что `npx <путь-к-tarball> <args>` (без `-p`) молча ничего не делает на Windows/Git Bash.
Используй форму `-p <tarball> claude-workspace <args>` выше, или запускай скрипт напрямую:
`node scripts/workspace.js init learning <targetDir>`.

## Тестирование

```bash
npm test
```

Ноль зависимостей, включая тесты — работают на встроенном тест-раннере Node (Node 18/20/22 при
каждом push и PR). Покрывает парсер YAML, подсказки при опечатках, слияние `.gitignore`,
`init`/`sync`/`doctor`/`add`/`remove` end-to-end во временной директории на реальных пресетах, свои
пресеты и неинтерактивную логику визарда. Raw-режим клавиатуры визарда требует настоящий TTY и
проверяется вручную, а не в CI.

## Атрибуция

Код самого пакета — MIT (см. [LICENSE](LICENSE)). Кроме `skills/core/` и `skills/formats/`, в
`skills/` вообще ничего не vendored — каждый скилл под конкретную технологию скачивается при
первом использовании прямо из репозитория своего автора (см. [Откуда реально берутся файлы
скилла](#откуда-реально-берутся-файлы-скилла)). Каждый сохраняет свою исходную лицензию и
авторство; здесь ничто не релицензируется и не выдаётся за собственную разработку.

| Источник | Лицензия | Скиллы |
|---|---|---|
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | MIT | `react-best-practices` |
| [jiji262/claude-design-skill](https://github.com/jiji262/claude-design-skill) | MIT | `claude-design` |
| [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) | MIT | `api-designer`, `security-reviewer`, `database-optimizer`, `microservices-architect`, `websocket-engineer`, `react-expert`, `vue-expert`, `graphql-architect`, `fullstack-guardian`, `ml-pipeline`, `rag-architect`, `fine-tuning-expert`, `pandas-pro`, `spark-engineer`, `devops-engineer`, `kubernetes-specialist`, `terraform-engineer`, `cloud-architect`, `code-reviewer`, `debugging-wizard`, `test-master`, `feature-forge` |

Всё в `skills/core/` и `skills/formats/` (`learning-guard`, `teacher`, `health-review`,
`commit-discipline`, `assignment-mode`, `codegraph`, `assignment-defend`, `spike`) — оригинальная
разработка этого проекта и единственное, что реально хранится в этом репозитории.

Внешние инструменты (`impeccable`, `superpowers`, `taste`, `ui-ux-pro-max`) тоже не vendored:
`init`/`add` только запускают их собственный установщик, их код живёт и остаётся в их собственных
репозиториях.

## Лицензия

[MIT](LICENSE)
