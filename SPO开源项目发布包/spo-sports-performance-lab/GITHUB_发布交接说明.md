# SPO 开源项目 GitHub 发布交接说明

## 一、任务目标

将本目录中的全部源码和文档发布到以下公开仓库的 `main` 分支：

- 仓库：`zhongqihuang762-ship-it/spo-sports-performance-lab`
- 地址：<https://github.com/zhongqihuang762-ship-it/spo-sports-performance-lab>
- 项目定位：SPO AI 运动表现、体态筛查与神经反应训练的开源演示和指标计算框架

发布时必须保留原有目录结构、中文文档文件名、MIT 许可证和第三方声明，不要加入任何账号、密码、API Key、学员真实信息或未成年人数据。

## 二、项目包含的核心内容

1. **AI 运动表现模块**：以人体关键点几何关系演示腾空、关节角度、左右对称性和落地控制等指标。
2. **AI 体态筛查模块**：以关键点相对位置演示肩线、骨盆、躯干偏移和膝关节排列等筛查指标。
3. **神经反应训练模块**：包含反应速度、选择判断、正确率、稳定性与移动反应等训练逻辑。
4. **技术证据文档**：架构、指标定义、数据隐私、比赛答辩口径和迭代路线。
5. **自动部署流程**：`.github/workflows/pages.yml` 可用于 GitHub Pages 部署。

本仓库公开的是可运行演示、指标定义和技术文档，不应夸大为医疗诊断系统，也不要把合作方未公开的商业源码、模型权重或真实用户数据加入仓库。

## 三、推荐发布步骤

压缩包同时提供 `spo-sports-performance-lab.git.bundle` 时，优先使用它发布，以保留已经整理好的提交历史：

```bash
git clone ../spo-sports-performance-lab.git.bundle spo-sports-performance-lab-publish
cd spo-sports-performance-lab-publish
git remote set-url origin https://github.com/zhongqihuang762-ship-it/spo-sports-performance-lab.git
git push -u origin main
```

如果接手工具无法识别 Git Bundle，再使用下面的普通源码发布方式。

在解压后的项目根目录执行：

```bash
git init
git branch -M main
git add .
git commit -m "feat: publish SPO sports performance open demo"
git remote add origin https://github.com/zhongqihuang762-ship-it/spo-sports-performance-lab.git
git push -u origin main
```

如果目录已经存在 `origin`，不要重复添加，改用：

```bash
git remote set-url origin https://github.com/zhongqihuang762-ship-it/spo-sports-performance-lab.git
git push -u origin main
```

只有确认远程仓库为空时才能直接首次推送。不要擅自使用 `--force` 覆盖已有内容。

## 四、GitHub Pages 设置

代码推送完成后：

1. 打开仓库的 **Settings → Pages**。
2. 在 **Build and deployment** 中选择 **GitHub Actions**。
3. 打开仓库 **Actions** 页面，确认 Pages 工作流运行成功。
4. 预期展示地址：<https://zhongqihuang762-ship-it.github.io/spo-sports-performance-lab/>

## 五、发布前验证

如本机有 Node.js，在项目根目录运行：

```bash
npm test
```

应当全部通过。也可以本地预览：

```bash
python3 -m http.server 8080
```

然后打开 <http://localhost:8080>。

## 六、发布完成后必须核对并回传

1. GitHub 仓库首页链接。
2. `main` 分支最新提交 SHA。
3. 仓库文件列表截图。
4. Actions 成功截图。
5. GitHub Pages 在线地址及首页截图。
6. 确认仓库中不存在真实 API Key、密码或个人敏感数据。

## 七、比赛展示建议

对外可准确表述为：

> 团队已公开发布 SPO 科技体能训练项目的三类核心模块演示、指标计算方法和技术文档，仓库具备公开时间记录、版本提交记录和可在线访问的演示页面。

不要把“开源演示仓库”表述成全部商业系统源代码，也不要用开源仓库代替软件著作权、合作授权或知识产权归属材料。
