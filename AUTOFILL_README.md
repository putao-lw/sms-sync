# 招聘表单自动填写工具

## 功能说明

这个工具可以自动填写招聘网站的表单，支持：
- 个人信息
- 求职意向
- 教育经历
- 实习经历
- 获奖情况
- 证书、论文等

## 使用步骤

### 1. 编辑配置文件

编辑 `autofill-profile.json` 文件，填写你的个人信息：

```json
{
  "personalInfo": {
    "name": "你的姓名",
    "email": "your@email.com",
    "phone": "13800138000",
    ...
  },
  "education": [...],
  "internship": [...],
  ...
}
```

### 2. 启动服务器

```bash
cd server
node index.js
```

### 3. 安装油猴脚本

将 `userscript/autofill-profile.user.js` 安装到 Tampermonkey。

### 4. 使用脚本

1. 打开招聘网站的表单页面
2. 点击右上角的「招聘表单自动填写」面板
3. 点击「从URL加载配置」或「导入JSON配置」
4. 点击「开始自动填写」

## 快捷键

- `Alt + A`：显示/隐藏面板

## 配置文件结构

### personalInfo（个人信息）
| 字段 | 说明 | 示例 |
|------|------|------|
| name | 姓名 | 林炜 |
| englishName | 英文名 | |
| idType | 证件类型 | 身份证 |
| idNumber | 证件号码 | |
| gender | 性别 | 男/女 |
| birthday | 出生日期 | 1998-01-01 |
| email | 邮箱 | test@example.com |
| nationality | 国籍 | 中国 |
| nativePlace | 籍贯 | |
| currentCity | 现居住地 | |
| phone | 手机号 | 13800138000 |
| qq | QQ号 | |
| wechat | 微信号 | |

### jobIntention（求职意向）
| 字段 | 说明 | 示例 |
|------|------|------|
| city1 | 意向城市1 | 北京 |
| city2 | 意向城市2 | 上海 |
| acceptCityAdjustment | 是否接受调剂 | 是/否 |
| howToKnow | 了解渠道 | |

### education（教育经历）
```json
{
  "startTime": "2020-09",
  "endTime": "2024-06",
  "degree": "本科",
  "degreeType": "全日制",
  "school": "厦门大学",
  "college": "信息学院",
  "major": "计算机科学",
  "ranking": "前10%",
  "studentId": "123456",
  "lab": "",
  "researchDirection": "",
  "supervisor": ""
}
```

### internship（实习经历）
```json
{
  "startTime": "2023-07",
  "endTime": "2023-10",
  "company": "字节跳动",
  "position": "产品经理",
  "content": "负责xxx产品的xxx功能..."
}
```

### awards（获奖情况）
```json
{
  "name": "国家奖学金",
  "time": "2023",
  "description": ""
}
```

## 注意事项

1. 配置文件中的字段名需要与表单字段对应
2. 如果表单使用了 React 等框架，脚本会尝试模拟原生事件
3. 部分下拉框可能需要手动选择，脚本会尝试自动选择
4. 建议先在测试页面验证填写效果

## 故障排除

### 配置加载失败
- 确保服务器已启动（`node index.js`）
- 检查 `http://localhost:3456/profile.json` 是否可访问

### 字段填写不成功
- 检查日志中的错误信息
- 某些字段可能需要特殊处理（如日期选择器、上传控件等）

### 一键复制日志
在 SMS 同步 app 中，点击「复制日志」按钮可以复制所有日志。
