---
name: NovelAI プロンプト規約
description: Danbooru タグ記法・強調・アーティストタグ・プロンプト順序・キャラクタープロンプトの書き方
---

NovelAIのプロンプトのルール

# プロンプトの記載方法
Danbooruタグの基本文法に伴って記述します。

【共通】
- 1girl, cowboy_shot, （ ", "で区切る、単語のつなぎには"_"を使用する。 ）
- 1.8::1girl::, 0.2::chibi::, （強調表現には""::danbooruTags::, "で区切る。）
- artist:artist_name, ( artistタグには"artist:"を先頭に記入 )

【キャラクタープロンプト】

- アクションタグで関係性を明確に指定できます。  
source#prompt,（行動する側）
target#prompt,（行動される側）
mutual#prompt,（相互行動）  
例 hug, kiss, looking_at_another, などのプロンプト

# プロンプトの順番

【ベースプレート】
- 先頭 人数タグ: 1girl, 1boy, solo, 2girls, など
- 2番目 アーティストタグ: 例 0.9::artist:suimya::, 0.5::artist:pan_(mimi)::, 0.4::artist:rinlaby::, 0.7::artist:miyahana_yu_(artist)::,
- 3番目 レーティングタグ: general, nsfw, hetero,
- 4番目 背景・情景タグ: sky, white_background,

プロンプト 例：  
1.7::1girl solo::, 1.2::artist:muririn::, 0.6::artist:hagi_(ame_hagi)::, 0.3::artist:miyahana yu (artist)::, 
christmas, outdoors, snow, illumination christmas tree, cityscape, 1.8::bokeh::, 1.5::blurry_background::, tokyo, sidewalk, city,

【キャラクタープロンプト】

- 先頭 キャラクター名: arona_(blue_archive), hoto_cocoa, など
- 2番目 版権名: blue_archive, genshin_impact, など
- 3番目 画角: cowboy_shot, upper_body, portrait, full_body, など 
- 4番目 服装: blouse, skirt, white_shirt, など
- 5番目 プレイ内容など: sex, girl_on_top, など

※ 男性側は版権キャラクター以外はキャラクタープロンプトを用意しない。

# 基本ベースプロンプト

こちらは使用する代表的なタグをまとめています。

【人数タグ】
タグ名 内容 
1girl 一人の女性
1boy 一人の男性
solo ソロ 
2girls 二人の女性
mmf_threesome 男性2人の3p
ffm_threesome 女性2人の3p 

【レーティングタグ】
general 全年齢
nsfw センシティブタグ
hetero 男女センシティブ
uncensored 無修正

【情景タグ】
white_background 白背景
white_bed 白色のベッド
bed_sheet シーツ
pillow 枕
outdoor 外
indoor 室内
window 窓
curtains カーテン
day 日中
night 夜
evening 夕方
washitsu 和室

# 基本キャラクタープロンプト

【画角】
upper_body 上半身
cowboy_shot 太ももから上、顔を含めた人物像を写した構図
feet_out_of_frame キャラクターの両足が画像からはみ出している
full_body 全身
portrait 顔フォーカス
dutch_angle 傾斜角度
from_behind 後ろの画角
from_side 横画角
from_above ハイアングル
from_below ローアングル
looking_back 振り向き

【視線】
looking_at_viewer 視聴者を見ている
looking_away 視線をそらしている
looking_up 上を見ている
looking_down 下を見ている
looking_to_the_side 横を見ている
looking_back 振り返っている
looking_ahead 前方を見ている
looking_afar 遠くを見ている
looking_at_another 他のキャラを見ている
looking_at_self 自分自身を見ている（鏡など）
looking_at_hand 自分の手を見ている
looking_at_phone スマホを見ている
eye_contact 目が合っている
sidelong_glance 流し目
glaring 睨んでいる
stare 凝視
empty_eyes 虚ろな目
half-closed_eyes 半目
closed_eyes 目を閉じている

【プレイ内容】
fellatio フェラチオ
anal_sex アナルセックス
vaginal 膣性交
creampie 膣内射精
cum_in_pussy フェイシャル（顔に精液をかける）
cum_in_mouth 口の中に精液をかける
cum_on_body 体に射精
facial 顔射
cum_on_breasts 胸に精液をかける
cum_on_ass アナルに精液をかける
fingering 手マン
deepthroat イマラチオ
rimjob アナル舐め
cunnilingus クニリ
paizuri パイズリ
buttjob 尻コキ
footjob 足コキ
handjob 手コキ
lactation ミルキング（搾乳行為）
orgasm 絶頂
blush 赤面
sweat 汗
drool 唾液
kiss キス
french_kiss フレンチキス
breast_sucking 乳首吸い
yuri レズビアン
doggystyle 後背位
cowgirl_position 騎乗位
reverse_cowgirl_position 逆騎乗位
squatting_cowgirl_position M字騎乗位
missionary 正常位
69 69
standing 立ち
sitting 座っている
kneeling 膝立ち
lying 横になる
bare_back ぱっくり背中
condom コンドーム着用
vibrator ローター
gag ガグ装着
collar 口塞
leash リード
nude 裸
completely_nude 完全裸
nipples 乳首
penis ペニス
pussy まんこ
arms_behind_back 手が後ろに
sex_from_behind 後ろからのSEX
trembling 震え
cum 精子
torso_grab 腰つかみ
leg_lift 片足上げ
grabbing_another's_breast 乳鷲掴み
