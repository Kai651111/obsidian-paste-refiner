# 4.9 SQP（Sequential Quadratic Programming）

按照你的符号习惯，重新讲解课件的 5 页内容。

先统一记号：

| 数学对象       | 使用的符号                          |
| ---------- | ------------------------------ |
| 决策变量（列向量）  | \\(\mathbf{x}\\)               |
| 搜索方向（列向量）  | \\(\mathbf{d}\_k\\)            |
| 不等式约束乘子    | \\(\mathbf{u}\geq\mathbf0\\)   |
| 等式约束乘子     | \\(\mathbf{v}\in\mathbb R^p\\) |
| Hessian 矩阵 | \\(\mathbf{H}\\)               |
| 梯度（列向量）    | \\(\nabla f(\mathbf{x})\\)     |
| 转置         | \\(T\\)                        |
| 算法赋值       | \\(:=\\)                       |

并且保留课件里的 \\(\boldsymbol{\eta}\_k,\boldsymbol{\rho}\_k\\)，分别表示第 \\(k\\) 个 QP 子问题求出来的两类乘子。

## Page 1 — SQP 的基本思想

考虑原始非线性约束优化问题：

\\[ \boxed{ \begin{aligned} (P)\quad \min\_{\mathbf{x}\in\mathbb R^n}\quad &f(\mathbf{x})\\\ \text{s.t.}\quad &g_i(\mathbf{x})\leq0,\quad i\in I\\\ &h_l(\mathbf{x})=0,\quad l\in E \end{aligned} } \\]

所有函数都是 \\(C^2\\)。

SQP 的核心思想：将 Newton Method 推广到带有非线性约束的优化问题。

Newton Method 对目标函数使用二阶 Taylor 展开：

\\[ \begin{aligned} f(\mathbf{x}\_k+\mathbf d) \approx {}&f(\mathbf{x}\_k) +\nabla f(\mathbf{x}\_k)^T\mathbf d\\\ &+\frac12\mathbf d^T \nabla^2f(\mathbf{x}\_k)\mathbf d \end{aligned} \\]

同样地，对不等式约束展开：

\\[ \begin{aligned} g_i(\mathbf{x}\_k+\mathbf d) \approx {}&g_i(\mathbf{x}\_k) +\nabla g_i(\mathbf{x}\_k)^T\mathbf d\\\ &+\frac12\mathbf d^T \nabla^2g_i(\mathbf{x}\_k)\mathbf d \end{aligned} \\]

对等式约束也可以做相同处理。

这样得到的近似问题具有：

- Quadratic objective
- Quadratic constraints

问题：这仍然不是标准的 Quadratic Programming（QP），因为 QP 要求约束是线性的。

因此我们需要进一步简化。

## Page 2 — 为什么使用 Lagrangian Hessian？

这是 SQP 最重要的理论推导。

### 1. 原始问题的 Lagrangian

\\[ \boxed{ L(\mathbf{x},\mathbf{u},\mathbf{v}) =f(\mathbf{x}) +\sum\_{i=1}^{m}u_i g_i(\mathbf{x}) +\sum\_{l=1}^{p}v_l h_l(\mathbf{x}) } \\]

对决策变量 \\(\mathbf{x}\\) 求二阶导数：

\\[ \boxed{ \begin{aligned} \nabla\_{\mathbf{xx}}^2L ={}&\nabla^2f(\mathbf{x})\\\ &+\sum\_{i=1}^{m}u_i\nabla^2g_i(\mathbf{x})\\\ &+\sum\_{l=1}^{p}v_l\nabla^2h_l(\mathbf{x}) \end{aligned} } \\]

为了符合你的矩阵记号，定义：

\\[ \boxed{ \mathbf{H}\_L(\mathbf{x},\mathbf{u},\mathbf{v}) :=\nabla\_{\mathbf{xx}}^2L(\mathbf{x},\mathbf{u},\mathbf{v}) } \\]

这里 \\(\mathbf{H}\_L\\) 是 Lagrangian Hessian，而不是单纯的 Objective Hessian。

### 2. 为什么不用普通的 Objective Hessian？

普通的 Hessian：

\\[ \nabla^2f(\mathbf{x}) \\]

只描述目标函数的局部曲率。

但是，约束本身也可能存在曲率：

\\[ \nabla^2g_i(\mathbf{x})\neq\mathbf0 \\]

因此，使用 Lagrangian Hessian 可以把目标函数和约束函数的二阶信息结合起来。

课件第 2 页的 Observation 就是：

如果使用第二阶近似的非线性约束问题，其 Lagrangian 的驻点方程可以写成包含 \\(\mathbf H_L\\) 的形式，那么使用以下 QP 也能得到相同形式的方向驻点方程：

\\[ \boxed{ \begin{aligned} (QPA_k)\quad \min\_{\mathbf d}\quad& \frac12\mathbf d^T \mathbf H_L(\mathbf{x}\_k,\boldsymbol\eta^\*,\boldsymbol\rho^\*) \mathbf d\\\ &+\nabla f(\mathbf{x}\_k)^T\mathbf d +f(\mathbf{x}\_k)\\\ \text{s.t.}\quad& g_i(\mathbf{x}\_k)+ \nabla g_i(\mathbf{x}\_k)^T\mathbf d\leq0\\\ & h_l(\mathbf{x}\_k)+ \nabla h_l(\mathbf{x}\_k)^T\mathbf d=0 \end{aligned} } \\]

现在我们得到了：

- 二次目标函数
- 线性约束

也就是 QP。

但是它仍然存在一个问题：

\\[ \boldsymbol\eta^\*,\boldsymbol\rho^\* \\]

是未知的乘子，无法直接代入。

因此，第 3 页要使用当前估计值来解决这个问题。

## Page 3 — SQP General Scheme

这一页是考试最重要的部分。

### Step 0：初始化

选择：

\\[ \boxed{ \mathbf{x}\_0,\quad\mathbf{u}\_0,\quad\mathbf{v}\_0 } \\]

其中：

- \\(\mathbf{x}\_0\\)：原始变量的初始估计
- \\(\mathbf{u}\_0\\)：不等式乘子的初始估计
- \\(\mathbf{v}\_0\\)：等式乘子的初始估计

设：

\\[ k:=0 \\]

### Step 1：计算 Lagrangian Hessian

在当前迭代点：

\\[ (\mathbf{x}\_k,\mathbf{u}\_k,\mathbf{v}\_k) \\]

定义：

\\[ \boxed{ \mathbf{H}\_k:= \nabla\_{\mathbf{xx}}^2L (\mathbf{x}\_k,\mathbf{u}\_k,\mathbf{v}\_k) } \\]

也就是：

\\[ \begin{aligned} \mathbf H_k={}&\nabla^2f(\mathbf{x}\_k)\\\ &+\sum\_{i=1}^{m}u\_{k,i}\nabla^2g_i(\mathbf{x}\_k)\\\ &+\sum\_{l=1}^{p}v\_{k,l}\nabla^2h_l(\mathbf{x}\_k) \end{aligned} \\]

### Step 2：求解 QP 子问题

\\[ \boxed{ \begin{aligned} (QP_k)\quad\min\_{\mathbf d}\quad& \frac12\mathbf d^T\mathbf H_k\mathbf d +\nabla f(\mathbf{x}\_k)^T\mathbf d\\\ \text{s.t.}\quad& g_i(\mathbf{x}\_k)+ \nabla g_i(\mathbf{x}\_k)^T\mathbf d\leq0\\\ & h_l(\mathbf{x}\_k)+ \nabla h_l(\mathbf{x}\_k)^T\mathbf d=0 \end{aligned} } \\]

这里与第 2 页的区别在于：

\\[ \mathbf H_L(\mathbf{x}\_k,\boldsymbol\eta^\*,\boldsymbol\rho^\*) \\]

被替换成了：

\\[ \mathbf H_k=\mathbf H_L(\mathbf{x}\_k,\mathbf u_k,\mathbf v_k) \\]

也就是使用当前乘子的估计值，而不是未知的最优乘子。

求解 QP 得到：

\\[ \boxed{ (\mathbf d_k,\boldsymbol\eta_k,\boldsymbol\rho_k) } \\]

其中 \\(\mathbf d_k\\) 是 QP 的解，另外两个是 QP 对应的 Lagrange multipliers。

### Step 3：更新

课件采用 Full-step SQP：

\\[ \boxed{ \begin{aligned} \mathbf{x}\_{k+1}&:=\mathbf{x}\_k+\mathbf d_k\\\ \mathbf{u}\_{k+1}&:=\boldsymbol\eta_k\\\ \mathbf{v}\_{k+1}&:=\boldsymbol\rho_k \end{aligned} } \\]

最后：

\\[ k:=k+1 \\]

继续迭代。

### 与 Newton Method 的比较

|         | Newton Method                                      | SQP                            |
| ------- | -------------------------------------------------- | ------------------------------ |
| 优化问题    | 无约束                                                | 非线性约束                          |
| Hessian | \\(\nabla^2f\\)                                    | \\(\mathbf H_L\\)              |
| 搜索方向    | 解 Newton 方程                                        | 解 QP                           |
| 更新      | \\(\mathbf{x}\_{k+1}:=\mathbf{x}\_k+\mathbf d_k\\) | 还要更新 \\(\mathbf u,\mathbf v\\) |
| 最优性目标   | Stationary point                                   | KKT point                      |

## Page 4 — SQP 与 KKT 的关系

课件给出两个重要结论。

### Property 1：SQP 是 Newton Method 的推广

SQP 的一次迭代可以解释成：

1. 对 Lagrangian 的最优性方程进行 Newton 型迭代。
2. 同时强制搜索方向满足原始可行域的线性近似约束。

因此：

\\[ \boxed{ \text{SQP} = \text{Newton-type step} + \text{Linearized constraints} } \\]

### Property 2：原始 KKT 点与 QP KKT 点的等价关系

课件的 Proposition：

\\[ \boxed{ (\mathbf{x}^\*,\mathbf{u}^\*,\mathbf{v}^\*) \text{ is a KKT point of }(P) } \\]

当且仅当在 \\((\mathbf{x}^\*,\mathbf{u}^\*,\mathbf{v}^\*)\\) 处构造的 QP 中：

\\[ \boxed{ (\mathbf d^\*,\boldsymbol\eta^\*,\boldsymbol\rho^\*) = (\mathbf0,\mathbf{u}^\*,\mathbf{v}^\*) } \\]

是该 QP 的 KKT 点。

为什么？

原始问题的 KKT Stationarity：

\\[ \boxed{ \nabla f(\mathbf{x}^\*) +\sum_i u_i^\*\nabla g_i(\mathbf{x}^\*) +\sum_l v_l^\*\nabla h_l(\mathbf{x}^\*) =\mathbf0 } \\]

QP 子问题的 KKT Stationarity：

\\[ \begin{aligned} \mathbf H_k\mathbf d^\* &+\nabla f(\mathbf{x}\_k)\\\ &+\sum_i\eta_i^\*\nabla g_i(\mathbf{x}\_k)\\\ &+\sum_l\rho_l^\*\nabla h_l(\mathbf{x}\_k) =\mathbf0 \end{aligned} \\]

令：

\\[ \begin{gathered} \mathbf{x}\_k=\mathbf{x}^\*,\qquad \mathbf d^\*=\mathbf0\\\ \boldsymbol\eta^\*=\mathbf u^\*,\qquad \boldsymbol\rho^\*=\mathbf v^\* \end{gathered} \\]

就有：

\\[ \mathbf H_k\mathbf d^\*=\mathbf0 \\]

因此 QP 的 Stationarity 退化为原始问题的 Stationarity。

同时，QP 的线性化约束与互补松弛条件也变为原始 KKT 条件。

结论：如果我们已经到达一个 KKT 点，那么 SQP 对应的 QP 可以以零方向作为 KKT 解。

注意这只是 KKT 点的对应关系，不代表所有 KKT 点都是局部最小点。

## Page 5 — SQP Convergence

### 1. Quadratic Local Convergence

在课件所列的适当条件下，SQP 具有与 Newton Method 类似的二次局部收敛性质。

课件给出三个条件：

(i) Lipschitz Continuous Hessians

目标函数与约束函数的 Hessian 都是 Lipschitz continuous。

(ii) Constraint Qualification

满足适当的 CQ，例如 LICQ。

(iii) Second-order Sufficient Conditions + Strict Complementarity

满足二阶充分最优性条件与严格互补条件。

Strict Complementarity 表示：

\\[ \boxed{ g_i(\mathbf{x}^\*)=0 \Longrightarrow u_i^\*>0 } \\]

在这些局部正则性假设及足够接近解的初值下，可以得到二次局部收敛。

### 2. Global Convergence

课件给出两种主要方法。

方法 A：Line Search with Merit Function

定义：

\\[ \boxed{ M(\mathbf{x};\mu) =f(\mathbf{x}) +\frac{1}{2\mu} \left[ \sum\_{i=1}^{m}\max\\{0,g_i(\mathbf{x})\\} +\sum\_{l=1}^{p}|h_l(\mathbf{x})| \right] } \\]

其中：

- \\(f(\mathbf{x})\\)：原始目标函数
- \\(\max\\{0,g_i(\mathbf{x})\\}\\)：不等式约束违反程度
- \\(|h_l(\mathbf{x})|\\)：等式约束违反程度

通过 Line Search 选择：

\\[ \alpha_k\in(0,1] \\]

然后更新：

\\[ \boxed{ \mathbf{x}\_{k+1}:=\mathbf{x}\_k+\alpha_k\mathbf d_k } \\]

目的是综合考虑目标函数与约束违反程度，而不是只让 \\(f(\mathbf{x})\\) 下降。

方法 B：Trust Region

在 QP 中加入：

\\[ \boxed{ \\|\mathbf d\\|\leq\Delta_k } \\]

限制每次迭代的步长，以免局部 Taylor 近似在远离当前点的位置失去准确性。

### 3. Quasi-Newton SQP

为了避免每次计算完整的 Lagrangian Hessian，可以构造近似矩阵：

\\[ \boxed{ \mathbf H_k\approx \nabla^2\_{\mathbf{xx}}L (\mathbf{x}\_k,\mathbf u_k,\mathbf v_k) } \\]

然后利用 BFGS 等 Quasi-Newton 方法更新 \\(\mathbf H_k\\)。

注意：这里近似的是 Lagrangian Hessian，而不是仅仅近似 \\(\nabla^2 f\\)。

## 考试默写版：SQP General Scheme

这是最适合直接写在笔记里的版本。

Initialization

Choose \\(\mathbf{x}\_0,\mathbf{u}\_0,\mathbf{v}\_0\\), set \\(k:=0\\).

Iteration \\(k\\)

1\. Compute:

\\[ \mathbf H_k:= \nabla^2\_{\mathbf{xx}}L (\mathbf{x}\_k,\mathbf u_k,\mathbf v_k) \\]

2\. Solve:

\\[ \begin{aligned} \min\_{\mathbf d}\quad& \frac12\mathbf d^T\mathbf H_k\mathbf d+ \nabla f(\mathbf{x}\_k)^T\mathbf d\\\ \text{s.t.}\quad& \nabla g_i(\mathbf{x}\_k)^T\mathbf d+ g_i(\mathbf{x}\_k)\leq0\\\ & \nabla h_l(\mathbf{x}\_k)^T\mathbf d+ h_l(\mathbf{x}\_k)=0 \end{aligned} \\]

Obtain \\((\mathbf d_k,\boldsymbol\eta_k,\boldsymbol\rho_k)\\).

3\. Update:

\\[ \boxed{ \begin{aligned} \mathbf{x}\_{k+1}&:=\mathbf{x}\_k+\mathbf d_k\\\ \mathbf{u}\_{k+1}&:=\boldsymbol\eta_k\\\ \mathbf{v}\_{k+1}&:=\boldsymbol\rho_k\\\ k&:=k+1 \end{aligned} } \\]

最终记住：SQP 每次迭代求解一个 QP，用 Lagrangian Hessian 近似二阶信息，用一阶 Taylor 展开线性化约束，再更新原始变量和 Lagrange multipliers。&#x20;